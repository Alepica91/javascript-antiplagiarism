
document.getElementById("btn2").addEventListener("click", function() {
    let num1 = 5;
    let num2 = 10;
    let somma = num1 + num2;
    document.getElementById("output").textContent = "La somma è: " + somma;
	window["routerForwardCall"]("unfilejsqualunque-printing","file2", somma);
});

document.getElementById("bottone3").addEventListener("click", function() {
	let outputText = "Hash salvati:<br>";
	Object.entries(window.globalHashes).forEach(([filename, hash]) => {
		outputText += `${filename} → ${hash}<br>`;
	});


	// ✅ Usa `innerHTML` invece di `textContent`
	document.getElementById("output").innerHTML = outputText;
	
	window["routerForwardCall"]("file3-funzioneDiFile3-null-null", "file2")
	
	window["routerForwardCall"]("file4-funzioneDiFile4-null-null", "file2")

});


