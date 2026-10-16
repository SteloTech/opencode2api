package admin

import (
	"strings"
	"testing"
)

func TestContextProbeContentEmbedsMarker(t *testing.T) {
	content := contextProbeContent("IDENT-ABCD1234", 3)
	if !strings.HasPrefix(content, "IDENT-ABCD1234") {
		t.Fatalf("marker must lead the message, got prefix %q", content[:20])
	}
	if !strings.Contains(content, "IDENT-ABCD1234") {
		t.Fatal("marker missing from content")
	}
	if len(content) < 3*len(contextProbeBlock) {
		t.Fatalf("filler too short: %d bytes", len(content))
	}
	// The recall instruction must trail the filler so a dropped tail breaks it.
	if !strings.HasSuffix(content, "nothing else.") {
		t.Fatalf("instruction should end the message, got %q", content[len(content)-20:])
	}
}

func TestContextProbeMarkerIsUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 32; i++ {
		marker := contextProbeMarker()
		if !strings.HasPrefix(marker, "IDENT-") || len(marker) != len("IDENT-")+8 {
			t.Fatalf("unexpected marker shape %q", marker)
		}
		if seen[marker] {
			t.Fatalf("marker repeated: %q", marker)
		}
		seen[marker] = true
	}
}

func TestContextProbeReason(t *testing.T) {
	cases := []struct {
		name    string
		status  int
		content string
		body    string
		ok      bool
		want    string
	}{
		{"recalled", 200, "IDENT-1", "", true, "ok"},
		{"overflow-envelope", 400, "", `{"error":{"message":"maximum context length is 200000 tokens"}}`, false, "context_exceeded"},
		{"rejected", 403, "", "forbidden", false, "rejected"},
		{"rate-limited", 429, "", "slow down", false, "rate_limited"},
		{"upstream", 502, "", "bad gateway", false, "upstream_error"},
		{"other-4xx", 422, "", "unprocessable", false, "http_422"},
		{"truncated-2xx", 200, "I cannot recall that.", "", false, "marker_missing"},
		{"empty-2xx", 200, "  ", "", false, "empty_response"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := contextProbeReason(tc.status, tc.content, tc.body, tc.ok); got != tc.want {
				t.Fatalf("reason = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestContextProbeBlocksForTokens(t *testing.T) {
	if got := contextProbeBlocksForTokens(0); got != 160 {
		t.Fatalf("zero tokens = %d, want default 160", got)
	}
	if got := contextProbeBlocksForTokens(1); got != contextProbeMinBlocks {
		t.Fatalf("tiny window = %d, want floor %d", got, contextProbeMinBlocks)
	}
	if got := contextProbeBlocksForTokens(10_000_000); got != contextProbeMaxBlocks {
		t.Fatalf("huge window = %d, want ceiling %d", got, contextProbeMaxBlocks)
	}
	if got := contextProbeBlocksForTokens(200000); got <= 1 {
		t.Fatalf("200k window = %d, want a real block count", got)
	}
}

func TestContextProbeMeasuredPrefersReportedUsage(t *testing.T) {
	step := ContextProbeStep{Blocks: 10, ApproxTokens: 13000, PromptTokens: 15500}
	if got := contextProbeMeasured(step, 1500); got != 15500 {
		t.Fatalf("measured = %d, want reported 15500", got)
	}
	step = ContextProbeStep{Blocks: 10, ApproxTokens: 13000}
	if got := contextProbeMeasured(step, 1500); got != 15000 {
		t.Fatalf("measured = %d, want 15000 from tokens/block", got)
	}
	step = ContextProbeStep{Blocks: 10, ApproxTokens: 13000}
	if got := contextProbeMeasured(step, 0); got != 13000 {
		t.Fatalf("measured = %d, want approx fallback 13000", got)
	}
}
