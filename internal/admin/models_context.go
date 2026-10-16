package admin

import (
	"net/http"
	"strings"

	"opencode2api/internal/config"
	"opencode2api/internal/httpx"
)

// handleSetModelContext records or clears the operator's context-window
// override for one model. It is a focused read-modify-write on models.context
// so the WebUI can correct a published window without round-tripping the whole
// configuration. Omitting context (or sending a non-positive value) clears the
// entry and restores the catalog/models.dev value.
func (a *Server) handleSetModelContext(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Model   string `json:"model"`
		Context *int   `json:"context"`
	}
	if err := decodeAdminJSON(w, r, &input); err != nil {
		writeAdminError(w, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	model := strings.TrimSpace(input.Model)
	if model == "" {
		writeAdminError(w, http.StatusBadRequest, "invalid_request", "model is required")
		return
	}
	result, err := a.manager.Update(func(cfg *config.Config) error {
		setModelContext(cfg, model, input.Context)
		return nil
	})
	if err != nil {
		writeAdminError(w, http.StatusBadRequest, "context_update_failed", a.manager.Redact(err.Error()))
		return
	}
	payload := a.debugModelsPayload()
	payload["result"] = result
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, payload)
}

// setModelContext edits cfg.Models.Context in place. A nil or non-positive
// window removes the entry, and an emptied map is collapsed to nil so the saved
// configuration stays clean.
func setModelContext(cfg *config.Config, model string, window *int) {
	if window == nil || *window <= 0 {
		delete(cfg.Models.Context, model)
		if len(cfg.Models.Context) == 0 {
			cfg.Models.Context = nil
		}
		return
	}
	if cfg.Models.Context == nil {
		cfg.Models.Context = map[string]int{}
	}
	cfg.Models.Context[model] = *window
}
