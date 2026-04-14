async function run() {
  const input = document.getElementById("input").value;
  const out = document.getElementById("output");

  if (!input) return;

  out.style.display = "block";
  out.innerHTML = "⏳ Thinking...";

  const payload = {
    prompt: input,
    task: mode === "analyze"
      ? "analysis"
      : mode === "search"
      ? "reasoning"
      : "chat"
  };

  const apiKey = localStorage.getItem("northsky_key");

  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || ""
      },
      body: JSON.stringify(payload)
    });

    const text = await res.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("NON-JSON RESPONSE:", text);
      throw new Error("Server did not return JSON");
    }

    if (!res.ok) {
      out.innerHTML = `
        <div class="msg ai">
          ❌ ${data.error || "Request failed"}
        </div>`;
      return;
    }

    if (mode === "ask") {
      out.innerHTML = `
        <div class="chat">
          <div class="msg user">${input}</div>
          <div class="msg ai">${data.reply}</div>
        </div>`;
    } else {
      out.innerHTML = `
        <div class="msg ai">
          🤖 ${data.provider || "deepseek"}<br><br>
          ${data.reply}
        </div>`;
    }

  } catch (err) {
    out.innerHTML = `
      <div class="msg ai">
        ⚠️ ${err.message}
      </div>`;
  }
}
