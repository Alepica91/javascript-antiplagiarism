document.addEventListener("DOMContentLoaded", () => {
    const hashesContainer = document.getElementById("hashes");
    const clearButton = document.getElementById("clear");

    // Recupera gli hash salvati
    chrome.storage.local.get({ hashes: [] }, (result) => {
        if (result.hashes.length === 0) {
            hashesContainer.innerHTML = "<p>Nessun hash trovato.</p>";
        } else {
            result.hashes.forEach(item => {
                const div = document.createElement("div");
                div.classList.add("hash-item");
                div.textContent = `${item.url}: ${item.hash}`;
                hashesContainer.appendChild(div);
            });
        }
    });

    // Pulsante per pulire gli hash
    clearButton.addEventListener("click", () => {
        chrome.storage.local.set({ hashes: [] }, () => {
            hashesContainer.innerHTML = "<p>Nessun hash trovato.</p>";
        });
    });
});
