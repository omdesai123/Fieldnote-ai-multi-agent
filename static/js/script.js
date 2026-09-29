/**
 * Fieldnote frontend logic.
 *
 * The backend runs the whole pipeline in one blocking call and returns a
 * single JSON payload at the end — it does not stream intermediate steps.
 * So the progress tracker below is a paced simulation of the four known
 * pipeline stages (search -> read -> draft -> review), not a live status
 * feed. It still gives an honest sense of what's happening and roughly
 * how long each stage tends to take.
 */

(() => {
  const form = document.getElementById("research-form");
  const topicInput = document.getElementById("topic");
  const submitBtn = document.getElementById("submit-btn");
  const errorBanner = document.getElementById("error-banner");
  const errorText = document.getElementById("error-text");

  const tracker = document.getElementById("tracker");
  const trackerStatus = document.getElementById("tracker-status");
  const steps = Array.from(document.querySelectorAll(".tracker__step"));

  const dossier = document.getElementById("dossier");
  const dossierTopic = document.getElementById("dossier-topic");
  const downloadBtn = document.getElementById("download-btn");

  const STAGE_MESSAGES = [
    { key: "search", text: "Searching the web for current sources…" },
    { key: "read", text: "Reading the most relevant source in depth…" },
    { key: "draft", text: "Drafting the report from what was found…" },
    { key: "review", text: "Having the critic review the draft…" },
  ];

  let stageTimer = null;
  let lastReport = "";

  function setStageIndex(index) {
    steps.forEach((step, i) => {
      step.classList.toggle("is-active", i === index);
      step.classList.toggle("is-done", i < index);
    });
    trackerStatus.textContent = STAGE_MESSAGES[index].text;
  }

  function startTracker() {
    tracker.hidden = false;
    let index = 0;
    setStageIndex(index);
    // Advance roughly in step with how long each stage usually takes.
    // If the real call finishes sooner or later, the final stage simply
    // holds until the response comes back.
    const timings = [4000, 6000, 7000];
    const advance = () => {
      if (index >= STAGE_MESSAGES.length - 1) return;
      stageTimer = setTimeout(() => {
        index += 1;
        setStageIndex(index);
        advance();
      }, timings[index] ?? 6000);
    };
    advance();
  }

  function stopTracker() {
    clearTimeout(stageTimer);
    tracker.hidden = true;
    steps.forEach((step) => step.classList.remove("is-active", "is-done"));
  }

  function showError(message) {
    errorText.textContent = message;
    errorBanner.hidden = false;
  }

  function clearError() {
    errorBanner.hidden = true;
    errorText.textContent = "";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.innerHTML = isLoading
      ? '<i class="fa-solid fa-spinner"></i><span class="btn__label">Researching…</span>'
      : '<span class="btn__label">Begin research</span><i class="fa-solid fa-arrow-right-long"></i>';
  }

  function fillDossier(data) {
    dossierTopic.textContent = data.topic;
    document.getElementById("report-content").textContent = data.report;
    document.getElementById("review-content").textContent = data.feedback;
    document.getElementById("search-content").textContent = data.search_results;
    document.getElementById("source-content").textContent = data.scraped_content;
    lastReport = data.report;
    dossier.hidden = false;
    dossier.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const topic = topicInput.value.trim();
    if (topic.length < 3) {
      showError("Give it a bit more to go on — at least a few words.");
      return;
    }

    setLoading(true);
    dossier.hidden = true;
    startTracker();

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.detail || "The research pipeline failed unexpectedly.");
      }

      fillDossier(payload);
    } catch (err) {
      showError(err.message || "Something went wrong reaching the research pipeline.");
    } finally {
      setLoading(false);
      stopTracker();
    }
  });

  // Folder tab switching
  document.querySelectorAll(".folder__tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".folder__tab").forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById(tab.dataset.target).classList.add("is-active");
    });
  });

  // Download the report as a plain text file
  downloadBtn.addEventListener("click", () => {
    if (!lastReport) return;
    const blob = new Blob([lastReport], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(dossierTopic.textContent || "report").slice(0, 60).replace(/\s+/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
})();
