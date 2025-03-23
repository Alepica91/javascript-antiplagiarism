window.globalHashes = {};

window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (event.data.action === "hashSaved") {
		let parts = event.data.url.split("/"); 
		let filename = parts[parts.length - 1];
		
		window.globalHashes[filename] = event.data.hash;
        console.log("🔹 Hash of "+filename+" received:", event.data.hash);
        
    }
});

function file1funct(){
	console.log("Finally file1");
}