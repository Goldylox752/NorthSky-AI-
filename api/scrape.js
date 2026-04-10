export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "No URL provided" });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const html = await response.text();

    // 🔍 TITLE
    const title =
      html.match(/<title>(.*?)<\/title>/i)?.[1] || "";

    // 🔍 DESCRIPTION
    const description =
      html.match(/<meta name="description" content="(.*?)"/i)?.[1] ||
      html.match(/<meta property="og:description" content="(.*?)"/i)?.[1] ||
      "";

    // 🔍 OG TAGS
    const ogTitle =
      html.match(/<meta property="og:title" content="(.*?)"/i)?.[1] || "";

    const ogImage =
      html.match(/<meta property="og:image" content="(.*?)"/i)?.[1] || "";

    // 🧠 CLEAN CONTENT
    const content = html
      .replace(/<script[^>]*>.*?<\/script>/gis, "")
      .replace(/<style[^>]*>.*?<\/style>/gis, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000); // limit size

    return res.status(200).json({
      title,
      description,
      ogTitle,
      ogImage,
      content
    });

  } catch (error) {
    return res.status(500).json({
      error: "Scrape failed",
      details: error.message
    });
  }
}