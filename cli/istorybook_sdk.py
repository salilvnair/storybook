"""
iStorybook Python SDK — S38.

A minimal Python client for the iStorybook REST API.

Usage:
    from istorybook_sdk import IStorybook

    sb = IStorybook(base_url="http://localhost:8787", api_key="isbk-...")

    # Generate a story and wait for completion
    story = sb.generate("A brave rabbit saves the forest", pages=5, wait=True)
    print(story["title"])

    # Download the PDF
    sb.download_pdf(story["id"], "./my-story.pdf")

    # Export to EPUB
    sb.download_epub(story["id"], "./my-story.epub")

    # List all stories
    for s in sb.list_stories():
        print(s["id"], s["title"])
"""

import os
import time
import json
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Optional


class IStorybook:
    """iStorybook Python SDK client."""

    def __init__(self, base_url: str = None, api_key: str = None):
        self.base_url = (base_url or os.environ.get("ISTORYBOOK_URL", "http://localhost:8787")).rstrip("/")
        self.api_key = api_key or os.environ.get("ISTORYBOOK_API_KEY", "")

    def _request(self, method: str, path: str, body=None, raw=False):
        url = f"{self.base_url}{path}"
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["x-api-key"] = self.api_key
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=60) as resp:
            if raw:
                return resp.read()
            return json.loads(resp.read())

    def list_stories(self) -> list:
        """List all generated stories."""
        return self._request("GET", "/api/v1/stories").get("stories", [])

    def get_story(self, story_id: str) -> dict:
        """Get a story by ID."""
        return self._request("GET", f"/api/v1/story/{story_id}")

    def get_status(self, job_or_story_id: str) -> dict:
        """Get the generation status of a job or story."""
        return self._request("GET", f"/api/v1/story/{job_or_story_id}/status")

    def generate(
        self,
        prompt: str,
        pages: int = 5,
        art_style: str = "",
        character_ids: list = None,
        wait: bool = False,
        poll_interval: int = 3,
        timeout: int = 300,
    ) -> dict:
        """
        Create a story. Returns the job immediately.
        If wait=True, polls until done and returns the completed story.
        """
        body = {"prompt": prompt, "pageCount": pages}
        if art_style:
            body["artStyle"] = art_style
        if character_ids:
            body["characterIds"] = character_ids

        job = self._request("POST", "/api/v1/story/create", body)

        if not wait:
            return job

        # Poll
        job_id = job["jobId"]
        deadline = time.time() + timeout
        while time.time() < deadline:
            time.sleep(poll_interval)
            status = self.get_status(job_id)
            if status.get("status") == "done":
                story_id = status.get("storyId")
                return self.get_story(story_id) if story_id else status
            if status.get("status") == "error":
                raise RuntimeError(f"Generation failed: {status.get('error')}")

        raise TimeoutError(f"Story generation timed out after {timeout}s")

    def download_pdf(self, story_id: str, out_path: str) -> str:
        """Download the story PDF to a file. Returns the file path."""
        data = self._request("GET", f"/api/v1/story/{story_id}/pdf", raw=True)
        path = Path(out_path)
        path.write_bytes(data)
        return str(path)

    def download_epub(self, story_id: str, out_path: str, layout: str = "reflowable") -> str:
        """Download the story as EPUB. Returns the file path."""
        data = self._request("GET", f"/api/stories/{story_id}/epub?layout={layout}", raw=True)
        path = Path(out_path)
        path.write_bytes(data)
        return str(path)

    def narrate(self, story_id: str, voice_id: str = "narrator") -> dict:
        """Generate TTS narration for a story."""
        return self._request("POST", f"/api/v1/story/{story_id}/narrate", {"voiceId": voice_id})

    def register_webhook(self, url: str, events: list = None, secret: str = None) -> dict:
        """Register a webhook endpoint."""
        body = {"url": url, "events": events or ["*"]}
        if secret:
            body["secret"] = secret
        return self._request("POST", "/api/v1/webhooks", body)

    def list_providers(self, capability: str = None) -> dict:
        """List all registered providers."""
        path = "/api/providers/sdk"
        if capability:
            path += f"?capability={capability}"
        return self._request("GET", path)

    def check_health(self) -> list:
        """Check health of all providers."""
        return self._request("GET", "/api/providers/sdk/health").get("results", [])

    def batch_generate(
        self,
        prompts: list,
        pages: int = 4,
        out_dir: str = ".",
        wait: bool = True,
    ) -> list:
        """Generate multiple stories from a list of prompts. Returns list of results."""
        results = []
        for i, prompt in enumerate(prompts, 1):
            print(f"[{i}/{len(prompts)}] {prompt[:60]}…")
            try:
                result = self.generate(prompt, pages=pages, wait=wait)
                story_id = result.get("id") or result.get("storyId")
                if story_id and wait:
                    out_path = str(Path(out_dir) / f"story-{i:03d}-{story_id[:8]}.pdf")
                    self.download_pdf(story_id, out_path)
                    print(f"  → {out_path}")
                results.append({"prompt": prompt, "result": result, "ok": True})
            except Exception as e:
                print(f"  ✗ Error: {e}")
                results.append({"prompt": prompt, "error": str(e), "ok": False})
        return results

    def export_config(self, out_path: str) -> str:
        """Export all app config as a .storybuddy bundle."""
        data = self._request("GET", "/api/config/export", raw=True)
        path = Path(out_path)
        path.write_bytes(data)
        return str(path)

    def import_config(self, path: str) -> dict:
        """Import config from a .storybuddy bundle file."""
        bundle = json.loads(Path(path).read_text())
        return self._request("POST", "/api/config/import", bundle)


# CLI usage when run directly
if __name__ == "__main__":
    import sys
    args = sys.argv[1:]
    sb = IStorybook()

    if not args or args[0] == "help":
        print(__doc__)
    elif args[0] == "list":
        for s in sb.list_stories():
            print(f"{s['id']}  {s.get('title', 'Untitled')}")
    elif args[0] == "generate" and len(args) > 1:
        result = sb.generate(args[1], wait=True)
        print(json.dumps(result, indent=2))
    elif args[0] == "status" and len(args) > 1:
        print(json.dumps(sb.get_status(args[1]), indent=2))
    elif args[0] == "health":
        for h in sb.check_health():
            icon = "🟢" if h.get("ok") else "🔴"
            print(f"{icon} {h['id']}  {h.get('status', '?')}")
    else:
        print(f"Unknown command: {args[0]}")
        sys.exit(1)
