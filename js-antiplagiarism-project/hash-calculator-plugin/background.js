chrome.webRequest.onCompleted.addListener(
    async (details) => {
        if (!details.url.endsWith(".js")) return;

        try {
			if(details.url.includes("recompiled")){
				const response = await fetch(details.url);
				const text = await response.text();
				const hash = await computeSHA256(text);

				console.log(`[DEBUG] Hash calcolato per ${details.url}: ${hash}`);

				// Salva l'hash in `chrome.storage.local`
				chrome.storage.local.get({ hashes: {} }, (result) => {
					let hashes = result.hashes;
					hashes[details.url] = hash;

					chrome.storage.local.set({ hashes: hashes }, () => {
						console.log(`[DEBUG] ✅ Hash di ${details.url} salvato.`);
					});
				});

				// Invia il messaggio alla pagina
				chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
					if (tabs.length === 0) return;
					chrome.scripting.executeScript({
						target: { tabId: tabs[0].id },
						func: (url, hash) => {
							window.postMessage({ action: "hashSaved", url: url, hash: hash }, "*");
						},
						args: [details.url, hash]
					});
				});
			}
        } catch (error) {
			console.error(error);
            console.error("[DEBUG] ❌ Errore nel calcolo/salvataggio dell'hash:", error);
        }
    },
    { urls: ["<all_urls>"] }
);

async function computeSHA256(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
