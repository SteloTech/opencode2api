package admin

import (
	"testing"

	"opencode2api/internal/config"
)

func TestSetModelContextSetsAndClears(t *testing.T) {
	cfg := config.Config{Models: config.ModelsConfig{Context: map[string]int{"a": 100}}}

	window := 1000000
	setModelContext(&cfg, "b", &window)
	if cfg.Models.Context["a"] != 100 || cfg.Models.Context["b"] != 1000000 {
		t.Fatalf("context after add = %+v", cfg.Models.Context)
	}

	// A non-positive window clears the entry.
	zero := 0
	setModelContext(&cfg, "b", &zero)
	if _, ok := cfg.Models.Context["b"]; ok {
		t.Fatalf("zero window should clear entry: %+v", cfg.Models.Context)
	}

	// A nil window also clears.
	setModelContext(&cfg, "a", nil)
	if cfg.Models.Context != nil {
		t.Fatalf("emptied map should collapse to nil: %+v", cfg.Models.Context)
	}

	// Clearing from a nil map is a no-op, not a panic.
	setModelContext(&cfg, "missing", nil)
	if cfg.Models.Context != nil {
		t.Fatalf("nil map should stay nil: %+v", cfg.Models.Context)
	}
}
