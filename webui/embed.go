// Package webui embeds the static management interface.
package webui

import (
	"embed"
	"io/fs"
	"os"
	"path/filepath"
)

// Assets contains the static management interface served by the admin listener.
//
//go:embed index.html app.js styles.css
var Assets embed.FS

// FS returns the production WebUI assets when WEBUI_ASSETS_DIR is configured,
// and falls back to the legacy embedded assets for standalone binaries.
func FS() fs.FS {
	if dir := os.Getenv("WEBUI_ASSETS_DIR"); dir != "" {
		if _, err := os.Stat(filepath.Join(dir, "index.html")); err == nil {
			return os.DirFS(dir)
		}
	}
	return Assets
}
