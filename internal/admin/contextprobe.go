package admin

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"opencode2api/internal/httpx"
	"opencode2api/internal/jsonutil"
	"opencode2api/internal/protocol"
	"opencode2api/internal/telemetry"
)

// The context probe measures how much input a model actually accepts, since the
// published context window is only a claim: the upstream free tier may serve a
// much smaller window, or silently drop the overflow instead of erroring.
//
// It places a random marker at the very start of a single user message, pads the
// middle with filler, and asks the model to echo the marker at the end. Recall
// across the whole window is the success signal. It bisects the filler size: the
// largest size whose marker is still recalled is the measured window.
//
// The probe drives the normal gateway handler, so routing, key selection,
// anonymous shaping and retries all behave exactly as for a real request. Each
// step is a genuine upstream call and consumes real (free) quota.
const (
	contextProbeWordsPerBlock   = 1000
	contextProbeAssumedPerBlock = 1300 // rough tokens per block, only to size the search
	contextProbeDefaultSteps    = 8
	contextProbeMinBlocks       = 2
	contextProbeMaxBlocks       = 4000
	contextProbeMaxTokens       = 32
)

var contextProbeBlock = strings.Repeat("token ", contextProbeWordsPerBlock)

type ContextProbeRequest struct {
	Model string `json:"model"`
	// Lower and Upper bound the search in filler blocks. Zero values use the
	// advertised context window to size the ceiling.
	Lower    int `json:"lower,omitempty"`
	Upper    int `json:"upper,omitempty"`
	MaxSteps int `json:"max_steps,omitempty"`
}

type ContextProbeStep struct {
	Blocks       int    `json:"blocks"`
	ApproxTokens int    `json:"approx_tokens"`
	PromptTokens int    `json:"prompt_tokens,omitempty"`
	OK           bool   `json:"ok"`
	HTTPStatus   int    `json:"http_status"`
	Reason       string `json:"reason,omitempty"`
	DurationMS   int64  `json:"duration_ms"`
}

type ContextProbeResult struct {
	Model          string             `json:"model"`
	Advertised     int                `json:"advertised,omitempty"`
	Measured       int                `json:"measured,omitempty"`
	ReachedUpper   bool               `json:"reached_upper"`
	TokensPerBlock int                `json:"tokens_per_block,omitempty"`
	Steps          []ContextProbeStep `json:"steps"`
	Message        string             `json:"message,omitempty"`
}

func (a *Server) handleContextProbe(w http.ResponseWriter, r *http.Request) {
	if !a.allowDebug(clientIP(r)) {
		writeAdminError(w, http.StatusTooManyRequests, "debug_rate_limited", "too many probe requests; retry in one minute")
		return
	}
	var input ContextProbeRequest
	if err := decodeAdminJSON(w, r, &input); err != nil {
		writeAdminError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	input.Model = strings.TrimSpace(input.Model)
	if input.Model == "" {
		writeAdminError(w, http.StatusBadRequest, "invalid_request", "model is required")
		return
	}
	cfg := a.manager.Config()
	if cfg.FirstEnabledServerKey() == "" {
		writeAdminError(w, http.StatusServiceUnavailable, "probe_unavailable", "no local server key is configured")
		return
	}
	if route := a.manager.DebugRoute(input.Model, protocol.Chat); route.NativeProtocol == protocol.SystemOne {
		w.Header().Set("Cache-Control", "no-store")
		httpx.WriteJSON(w, http.StatusOK, ContextProbeResult{
			Model:   input.Model,
			Steps:   []ContextProbeStep{},
			Message: "该模型使用 System One 原生协议，不支持基于聊天标记的上下文实测。",
		})
		return
	}
	result := a.runContextProbe(r.Context(), cfg.FirstEnabledServerKey(), input)
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (a *Server) runContextProbe(ctx context.Context, serverKey string, input ContextProbeRequest) ContextProbeResult {
	result := ContextProbeResult{
		Model:      input.Model,
		Advertised: a.manager.AdvertisedContextWindow(input.Model),
		Steps:      []ContextProbeStep{},
	}
	lower := input.Lower
	if lower < 1 {
		lower = 1
	}
	upper := input.Upper
	if upper < lower+1 {
		upper = contextProbeBlocksForTokens(result.Advertised)
	}
	if upper < lower+1 {
		upper = lower + 1
	}
	if upper > contextProbeMaxBlocks {
		upper = contextProbeMaxBlocks
	}
	steps := input.MaxSteps
	if steps < 1 {
		steps = contextProbeDefaultSteps
	}

	baseline := a.contextProbeTrial(ctx, serverKey, input.Model, lower)
	result.Steps = append(result.Steps, baseline)
	if !baseline.OK {
		result.Message = "基线请求未返回标记，模型可能不可用或在改写请求；请先在 Playground 验证该模型可用。"
		return result
	}
	if baseline.PromptTokens > 0 && lower > 0 {
		result.TokensPerBlock = baseline.PromptTokens / lower
		if result.TokensPerBlock < 1 {
			result.TokensPerBlock = 1
		}
	}

	ceiling := a.contextProbeTrial(ctx, serverKey, input.Model, upper)
	result.Steps = append(result.Steps, ceiling)
	if ceiling.OK {
		result.ReachedUpper = true
		result.Measured = contextProbeMeasured(ceiling, result.TokensPerBlock)
		result.Message = fmt.Sprintf("在探测上限 %d blocks（约 %d tokens）处仍能召回标记；提高 upper 才能找到真实上限。", upper, result.Measured)
		return result
	}

	lo, hi := lower, upper
	for n := 0; n < steps && hi-lo > 1; n++ {
		mid := lo + (hi-lo)/2
		trial := a.contextProbeTrial(ctx, serverKey, input.Model, mid)
		result.Steps = append(result.Steps, trial)
		if trial.OK {
			lo = mid
		} else {
			hi = mid
		}
	}
	best := baseline
	for _, step := range result.Steps {
		if step.OK && step.Blocks > best.Blocks {
			best = step
		}
	}
	result.Measured = contextProbeMeasured(best, result.TokensPerBlock)
	result.Message = fmt.Sprintf("实测可接受上限约 %d tokens（成功于 %d blocks，失败于 %d blocks）。", result.Measured, lo, hi)
	return result
}

func (a *Server) contextProbeTrial(ctx context.Context, serverKey, model string, blocks int) ContextProbeStep {
	needle := contextProbeMarker()
	step := ContextProbeStep{Blocks: blocks, ApproxTokens: blocks * contextProbeAssumedPerBlock}
	payload := map[string]any{
		"model":       model,
		"stream":      false,
		"temperature": 0,
		"max_tokens":  contextProbeMaxTokens,
		"messages":    []any{map[string]any{"role": "user", "content": contextProbeContent(needle, blocks)}},
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		step.Reason = "encode_failed"
		return step
	}
	trace := &telemetry.RequestMeta{}
	request, err := http.NewRequestWithContext(telemetry.WithRequestMeta(ctx, trace), http.MethodPost, "http://gateway.local/v1/chat/completions", bytes.NewReader(encoded))
	if err != nil {
		step.Reason = "request_failed"
		return step
	}
	request.Header.Set("Authorization", "Bearer "+serverKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	recorder := newDebugResponseRecorder()
	started := time.Now()
	a.manager.Handler().ServeHTTP(recorder, request)
	step.HTTPStatus = recorder.status
	step.DurationMS = max(time.Since(started).Milliseconds(), 0)

	body := recorder.body.Bytes()
	content := ""
	var document map[string]any
	if json.Unmarshal(body, &document) == nil {
		step.PromptTokens = jsonutil.IntAt(document, "usage", "prompt_tokens")
		if choices := jsonutil.SliceAt(document, "choices"); len(choices) > 0 {
			if choice, ok := choices[0].(map[string]any); ok {
				content = jsonutil.StringAt(choice, "message", "content")
			}
		}
	}
	step.OK = recorder.status >= 200 && recorder.status < 300 && strings.Contains(strings.ToLower(content), strings.ToLower(needle))
	step.Reason = contextProbeReason(recorder.status, content, string(body), step.OK)
	return step
}

func contextProbeReason(status int, content, body string, ok bool) string {
	if ok {
		return "ok"
	}
	if status == 0 {
		return "transport_error"
	}
	if status >= 400 {
		switch {
		case contextOverflow(body):
			return "context_exceeded"
		case status == http.StatusUnauthorized || status == http.StatusForbidden:
			return "rejected"
		case status == http.StatusTooManyRequests:
			return "rate_limited"
		case status >= 500:
			return "upstream_error"
		default:
			return fmt.Sprintf("http_%d", status)
		}
	}
	if strings.TrimSpace(content) == "" {
		return "empty_response"
	}
	if contextOverflow(content) {
		return "context_exceeded"
	}
	return "marker_missing"
}

func contextOverflow(text string) bool {
	lower := strings.ToLower(text)
	for _, marker := range []string{
		"context length", "context_length_exceeded", "context window", "maximum context",
		"too many tokens", "reduce the length", "input is too long", "prompt is too long",
		"exceeds the maximum", "exceed the maximum", "max context",
	} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func contextProbeMarker() string {
	raw := make([]byte, 4)
	if _, err := rand.Read(raw); err != nil {
		return "IDENT-00000000"
	}
	return "IDENT-" + strings.ToUpper(hex.EncodeToString(raw))
}

func contextProbeContent(needle string, blocks int) string {
	return needle + "\n\n" + strings.Repeat(contextProbeBlock, blocks) +
		"\n\nThe marker at the very start of this message is important. Reply with only that marker, exactly as written, and nothing else."
}

func contextProbeBlocksForTokens(tokens int) int {
	if tokens <= 0 {
		return 160
	}
	blocks := tokens * 3 / 2 / contextProbeAssumedPerBlock
	if blocks < contextProbeMinBlocks {
		return contextProbeMinBlocks
	}
	if blocks > contextProbeMaxBlocks {
		return contextProbeMaxBlocks
	}
	return blocks
}

func contextProbeMeasured(step ContextProbeStep, tokensPerBlock int) int {
	if step.PromptTokens > 0 {
		return step.PromptTokens
	}
	if tokensPerBlock > 0 {
		return step.Blocks * tokensPerBlock
	}
	return step.ApproxTokens
}
