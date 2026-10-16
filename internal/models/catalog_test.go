package models

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"opencode2api/internal/config"
	wire "opencode2api/internal/protocol"
)

func capabilityMetadata(model string, window, maxOutput int) map[config.Tier]map[string]Metadata {
	return map[config.Tier]map[string]Metadata{
		config.TierZen: {model: {ContextWindow: window, MaxOutput: maxOutput, ToolCall: true}},
		config.TierGo:  {},
	}
}

func TestMetadataForTierAppliesContextOverride(t *testing.T) {
	const model = "glm-5.3-flash-free"
	catalog := NewCatalog(config.TierZen, nil)
	catalog.ReplaceWithCapabilities(
		[]string{model}, nil,
		map[config.Tier]map[string]wire.Protocol{config.TierZen: {model: wire.Chat}, config.TierGo: {}},
		nil,
		capabilityMetadata(model, 200000, 32000),
	)

	// The capability catalog stays authoritative until an override exists.
	if got := catalog.MetadataForTier(model, config.TierZen).ContextWindow; got != 200000 {
		t.Fatalf("catalog context = %d, want 200000", got)
	}

	catalog.SetContextOverrides(map[string]int{model: 65536})
	metadata := catalog.MetadataForTier(model, config.TierZen)
	if metadata.ContextWindow != 65536 {
		t.Fatalf("override context = %d, want 65536", metadata.ContextWindow)
	}
	// The override only touches the context window.
	if metadata.MaxOutput != 32000 {
		t.Fatalf("override clobbered max output: %d, want 32000", metadata.MaxOutput)
	}

	// Clearing the overrides restores the published value.
	catalog.SetContextOverrides(nil)
	if got := catalog.MetadataForTier(model, config.TierZen).ContextWindow; got != 200000 {
		t.Fatalf("context after clear = %d, want 200000", got)
	}
}

func TestMetadataForTierOverrideWinsOverModelsDev(t *testing.T) {
	const model = "unknown-free"
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	cache := map[string]any{
		"updated_at": "2026-01-01T00:00:00Z",
		"models": map[string]any{
			model: map[string]any{"id": model, "context_window": 123456, "max_output": 8000},
		},
	}
	encoded, err := json.Marshal(cache)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".models.dev.json", encoded, 0o600); err != nil {
		t.Fatal(err)
	}

	catalog := NewCatalog(config.TierZen, nil)
	catalog.SetPricingStore(NewPricingStore(path, nil))
	if got := catalog.MetadataForTier(model, config.TierZen).ContextWindow; got != 123456 {
		t.Fatalf("models.dev context = %d, want 123456", got)
	}

	catalog.SetContextOverrides(map[string]int{model: 4096})
	metadata := catalog.MetadataForTier(model, config.TierZen)
	if metadata.ContextWindow != 4096 {
		t.Fatalf("override over models.dev = %d, want 4096", metadata.ContextWindow)
	}
	if metadata.MaxOutput != 8000 {
		t.Fatalf("override clobbered models.dev max output: %d, want 8000", metadata.MaxOutput)
	}
}

func TestContextInfoForTierReportsSource(t *testing.T) {
	const model = "glm-5.3-flash-free"
	catalog := NewCatalog(config.TierZen, nil)
	catalog.ReplaceWithCapabilities(
		[]string{model}, nil,
		map[config.Tier]map[string]wire.Protocol{config.TierZen: {model: wire.Chat}, config.TierGo: {}},
		nil,
		capabilityMetadata(model, 200000, 32000),
	)

	info := catalog.ContextInfoForTier(model, config.TierZen)
	if info.Window != 200000 || info.Source != "catalog" || info.Override != nil {
		t.Fatalf("catalog info = %+v, want window 200000 source catalog without override", info)
	}
	if info.MaxOutput != 32000 {
		t.Fatalf("catalog max output = %d, want 32000", info.MaxOutput)
	}

	catalog.SetContextOverrides(map[string]int{model: 1000000})
	info = catalog.ContextInfoForTier(model, config.TierZen)
	if info.Window != 1000000 || info.Source != "override" {
		t.Fatalf("override info = %+v, want window 1000000 source override", info)
	}
	if info.Override == nil || *info.Override != 1000000 {
		t.Fatalf("override pointer = %v, want 1000000", info.Override)
	}

	catalog.SetContextOverrides(nil)
	if info = catalog.ContextInfoForTier(model, config.TierZen); info.Source != "catalog" || info.Override != nil {
		t.Fatalf("cleared info = %+v, want source catalog without override", info)
	}

	if info = catalog.ContextInfoForTier("never-seen", config.TierZen); info.Window != 0 || info.Source != "none" {
		t.Fatalf("unknown model info = %+v, want source none", info)
	}
}
