(() => {
  "use strict";

  const repository = "kaliuzhnyi/postiqo-publisher-releases";
  const installerName = "Postiqo.Publisher.Windows-win-Setup.exe";
  const version = document.getElementById("release-version");
  const details = document.getElementById("release-details");
  const button = document.getElementById("download-installer");
  const status = document.getElementById("release-status");

  async function loadRelease() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
        credentials: "omit"
      });
      if (!response.ok) throw new Error("Release details unavailable");

      const release = await response.json();
      const installer = release.assets?.find(asset => asset.name === installerName && asset.state === "uploaded");
      if (release.draft || release.prerelease || !/^v?\d+\.\d+\.\d+$/.test(release.tag_name) || !installer) {
        throw new Error("No stable Windows installer");
      }

      const downloadUrl = `https://github.com/${repository}/releases/download/${release.tag_name}/${installerName}`;
      if (installer.browser_download_url !== downloadUrl) throw new Error("Unexpected installer URL");

      const metadata = ["Windows"];
      if (Number.isFinite(installer.size) && installer.size > 0) {
        metadata.push(`${(installer.size / 1000000).toFixed(1)} MB`);
      }
      const published = new Date(release.published_at);
      if (release.published_at && !Number.isNaN(published.getTime())) {
        metadata.push(`Released ${new Intl.DateTimeFormat("en-CA", {
          month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
        }).format(published)}`);
      }

      version.textContent = `Version ${release.tag_name.replace(/^v/, "")}`;
      details.textContent = metadata.join(" · ");
      // Keep the displayed version and the downloaded installer in sync.
      button.href = downloadUrl;
    } catch {
      // The HTML link still downloads the latest installer without API access or JavaScript.
      status.textContent = "Version details are temporarily unavailable. You can still download the latest installer.";
      status.hidden = false;
    } finally {
      clearTimeout(timeout);
    }
  }

  loadRelease();
})();
