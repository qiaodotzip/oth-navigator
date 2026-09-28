/**
 * The team-code page, whole: its style inline and no script, because nothing
 * else (not the app's code, not its font) is served before the code is
 * typed. The look follows spec §12 by hand: warm greys, the teal accent, a
 * visible focus ring, 14 px text, 6 px corners.
 */
const STYLE = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f5f4;color:#1c1917;font:14px/20px Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:320px;background:#fff;border:1px solid #e7e5e4;border-radius:6px;padding:24px;box-shadow:0 1px 3px rgba(28,25,23,.08)}
h1{margin:0 0 4px;font-size:18px;line-height:28px;font-weight:600}
p{margin:0}
.lead{margin-bottom:16px;font-size:13px;line-height:18px;color:#57534e}
label{display:block;font-weight:500}
input{display:block;width:100%;margin-top:4px;height:36px;padding:0 10px;border:1px solid #d6d3d1;border-radius:6px;font:inherit}
.error{margin-top:8px;color:#b91c1c}
button{display:block;width:100%;margin-top:16px;height:36px;border:0;border-radius:6px;background:#0f766e;color:#fff;font:inherit;font-weight:500;cursor:pointer}
button:hover{background:#115e59}
input:focus-visible,button:focus-visible{outline:2px solid #14b8a6;outline-offset:2px}
.help{margin-top:16px;font-size:13px;line-height:18px;color:#57534e}
`;

/** For text put back into the page: the address you were going to, which anyone can write. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The code field is a password field, so a screenshot or someone behind you
 * sees dots. `next` rides along in the form, so the right code lands you where
 * the link you followed pointed.
 */
export function gatePage({ next, error }: { next: string; error?: string }): string {
  const invalid = error ? ' aria-invalid="true" aria-describedby="error"' : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>OTH Map</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>OTH Map</h1>
<p class="lead">Enter the team code to continue. You only need to do this once in this browser.</p>
<form method="post" action="/api/gate">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<label for="code">Team code</label>
<input id="code" name="code" type="password" autocomplete="off" required autofocus${invalid}>
${error ? `<p id="error" class="error" role="alert">${escapeHtml(error)}</p>` : ""}
<button type="submit">Continue</button>
</form>
<p class="help">Don't have it? Ask whoever sent you the link.</p>
</main>
</body>
</html>`;
}
