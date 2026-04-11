let html = await fetchDirect(url);

if (!html) {
  html = await fetchProxy(url);
}

let finalHtml = html;

if (needsBrowser(finalHtml)) {
  console.log("⚠️ Using browser fallback");
  finalHtml = await fetchWithBrowser(url);
}