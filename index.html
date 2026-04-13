<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>

<title>NorthSky Intelligence</title>

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">

<style>
body {
  margin: 0;
  font-family: 'Inter', sans-serif;
  background: #0f172a;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}

.container {
  text-align: center;
  width: 90%;
  max-width: 600px;
}

h1 {
  font-size: 32px;
  margin-bottom: 20px;
}

.input-group {
  display: flex;
  gap: 10px;
}

input {
  flex: 1;
  padding: 14px;
  border-radius: 10px;
  border: none;
  font-size: 16px;
}

button {
  padding: 14px 20px;
  border: none;
  border-radius: 10px;
  background: #3b82f6;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

button:hover {
  background: #2563eb;
}

.result {
  margin-top: 30px;
  text-align: left;
  background: #1e293b;
  padding: 20px;
  border-radius: 12px;
}

img {
  max-width: 100%;
  border-radius: 10px;
  margin-top: 10px;
}
</style>
</head>

<body>

<div class="container">
  <h1>NorthSky Intelligence</h1>

  <div class="input-group">
    <input id="urlInput" placeholder="Enter any website (example.com)" />
    <button onclick="analyze()">Analyze</button>
  </div>

  <div id="result" class="result" style="display:none;"></div>
</div>

<script>
async function analyze() {
  const input = document.getElementById("urlInput").value.trim();
  const resultBox = document.getElementById("result");

  if (!input) {
    alert("Enter a URL");
    return;
  }

  resultBox.style.display = "block";
  resultBox.innerHTML = "⏳ Analyzing...";

  try {
    const res = await fetch(`/api/rip?url=${encodeURIComponent(input)}`);
    const data = await res.json();

    if (!data.success) {
      resultBox.innerHTML = "❌ Failed to fetch data";
      return;
    }

    const m = data.metadata;

    resultBox.innerHTML = `
      <h2>${m.title}</h2>
      <p>${m.description}</p>
      ${m.image ? `<img src="${m.image}" />` : ""}
      <p><strong>${m.site}</strong></p>
    `;
  } catch (err) {
    resultBox.innerHTML = "❌ Error connecting to API";
  }
}
</script>

</body>
</html>