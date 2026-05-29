import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";
var DATA_DIR = path.resolve(__dirname, "public/data");
/**
 * Dev-only endpoint so the in-app editors can write straight into
 * `public/data/**` instead of downloading a file you then move by hand.
 * POST /__save { name: "entrances.json" | "floors/L1.json" | …, data: any }.
 * Restricted to .json files that resolve inside public/data (no traversal).
 * Pairs with `server.watch.ignored` below so these writes don't full-reload
 * the editor (which would drop the blob-URL floor image you uploaded).
 */
function devSavePlugin() {
    return {
        name: "oth-dev-save",
        apply: "serve",
        configureServer: function (server) {
            server.middlewares.use("/__save", function (req, res) {
                var reject = function (code, msg) {
                    res.statusCode = code;
                    res.setHeader("content-type", "application/json");
                    res.end(JSON.stringify({ error: msg }));
                };
                if (req.method !== "POST")
                    return reject(405, "POST only");
                var body = "";
                req.on("data", function (c) { return (body += c); });
                req.on("end", function () {
                    try {
                        var _a = JSON.parse(body), name_1 = _a.name, data = _a.data;
                        if (!name_1 || !/^[\w\-/]+\.json$/.test(name_1) || name_1.includes(".."))
                            return reject(400, "bad file name");
                        var target = path.resolve(DATA_DIR, name_1);
                        if (target !== DATA_DIR && !target.startsWith(DATA_DIR + path.sep))
                            return reject(400, "outside public/data");
                        fs.mkdirSync(path.dirname(target), { recursive: true });
                        fs.writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
                        res.statusCode = 200;
                        res.setHeader("content-type", "application/json");
                        res.end(JSON.stringify({ ok: true, path: "public/data/".concat(name_1) }));
                    }
                    catch (e) {
                        reject(500, String(e));
                    }
                });
            });
        },
    };
}
export default defineConfig({
    plugins: [react(), devSavePlugin()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
    server: {
        proxy: {
            "/api": "http://localhost:3000",
        },
        // Editors write here continuously; don't let that reload the page.
        watch: { ignored: ["**/public/data/**"] },
    },
    test: {
        globals: true,
        environment: "node",
    },
});
