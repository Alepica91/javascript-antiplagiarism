async function computeSHA256(content) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

chrome.webRequest.onCompleted.addListener(
    async (details) => {
        if (details.url.endsWith(".js")) {
            try {
                const response = await fetch(details.url);
                const text = await response.text();
                const hash = await computeSHA256(text);
                
                // Salva l'hash per il popup
                chrome.storage.local.get({ hashes: [] }, (result) => {
                    let hashes = result.hashes;
                    hashes.push({ url: details.url, hash: hash });
                    chrome.storage.local.set({ hashes: hashes });
                });

                console.log(`Hash di ${details.url}: ${hash}`);
            } catch (error) {
                console.error("Errore nel calcolo dell'hash:", error);
            }
        }
    },
    { urls: ["<all_urls>"] }
);


