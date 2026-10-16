package config

import "testing"

func validBaseConfig() Config {
	return Config{
		Listen:      "127.0.0.1:8080",
		ServerKeys:  []string{"local-key"},
		Anonymous:   true,
		Upstream:    UpstreamConfig{Zen: "https://opencode.ai/zen", Go: "https://opencode.ai/zen/go"},
		Retry:       RetryConfig{MaxAttempts: 3, TimeoutSeconds: 300},
		Models:      ModelsConfig{RefreshSeconds: 300, Protocols: map[string]string{}, Context: map[string]int{"glm-5.3-flash-free": 65536}},
		Performance: PerformanceConfig{MaxIdleConns: 1, MaxIdleConnsPerHost: 1, IdleConnTimeoutSeconds: 1, ConnectTimeoutSeconds: 1, FailureCooldownSeconds: 1},
		Logging:     LoggingConfig{Level: "info", RingSize: 100},
		Prefer:      TierGo,
		WebUI:       WebUIConfig{Enabled: false},
	}
}

func TestNormalizeAcceptsContextOverride(t *testing.T) {
	cfg, err := Normalize("", validBaseConfig())
	if err != nil {
		t.Fatalf("Normalize rejected a valid context override: %v", err)
	}
	if cfg.Models.Context["glm-5.3-flash-free"] != 65536 {
		t.Fatalf("context override dropped: %+v", cfg.Models.Context)
	}
}

func TestNormalizeRejectsBadContextOverride(t *testing.T) {
	cases := map[string]map[string]int{
		"empty model":     {"": 1000},
		"blank model":     {"   ": 1000},
		"zero window":     {"glm-5.3-flash-free": 0},
		"negative window": {"glm-5.3-flash-free": -1},
	}
	for name, overrides := range cases {
		t.Run(name, func(t *testing.T) {
			cfg := validBaseConfig()
			cfg.Models.Context = overrides
			if _, err := Normalize("", cfg); err == nil {
				t.Fatalf("Normalize accepted invalid override %+v", overrides)
			}
		})
	}
}

func TestCloneCopiesContextOverride(t *testing.T) {
	original := validBaseConfig()
	clone := Clone(original)
	clone.Models.Context["glm-5.3-flash-free"] = 1
	clone.Models.Context["added"] = 2
	if original.Models.Context["glm-5.3-flash-free"] != 65536 {
		t.Fatalf("clone mutated the original context map: %+v", original.Models.Context)
	}
	if _, ok := original.Models.Context["added"]; ok {
		t.Fatalf("clone share leaked a new key into the original: %+v", original.Models.Context)
	}
}
