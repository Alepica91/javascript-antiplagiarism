

/**
 * Router Forward Call function for browser.
 *
 * Receives an encrypted callString (encrypted and base64 encoded) and a 'callee'
 * string (the second parameter that indicates which dependency branch to use).
 *
 * It decodes the global objects DEPENDENCY_TREE_BASE64 and IVS_MAPPING_BASE64,
 * reconstructs the encryption key by XORing the hashes of all non-router-dependent files in the branch,
 * then XORs that result with the "mask" provided in the IVS mapping for the callee,
 * looks up the corresponding IV for the callString,
 * and finally uses the final key and IV to decrypt the callString (via AES-256-CBC).
 * The decrypted plaintext is parsed as JSON and used to call the specified function.
 *
 */
function routerForwardCall(callString, callee, ...args) {
  // Ensure callee ends with ".js"
  let fileKey = callee;
  if (!fileKey.endsWith(".js")) {
    fileKey += ".js";
  }

  // Decode the global dependency tree and IV mapping from base64
  const dependencyTreeJSON = window.atob(DEPENDENCY_TREE_BASE64);
  const dependencyTree = JSON.parse(dependencyTreeJSON);

  const ivsMappingJSON = window.atob(IVS_MAPPING_BASE64);
  const ivsMapping = JSON.parse(ivsMappingJSON);

  // Retrieve the mapping for the file indicated by 'callee'
  const mappingForFile = ivsMapping[fileKey];
  if (!mappingForFile) {
    console.error("No IV mapping found for", fileKey);
    return;
  }
  if (!mappingForFile.mask) {
    console.error("No mask found for", fileKey);
    return;
  }

  // Reconstruct the branch from the dependency tree for fileKey.
  // Collect only files that are non-router-dependent.
  let branchFiles = [];
  let visited = new Set();
  for (const f in dependencyTree) {
    if (f.endsWith(fileKey)) {
      if (!dependencyTree[f].routerDependant && !visited.has(f)) {
        branchFiles.push(f);
		visited.add(dep);
      }
      (function collectDeps(node) {
        for (const dep in node.dependencies) {
          if (!node.dependencies[dep].routerDependant && !visited.has(dep)) {
            branchFiles.push(dep);
			visited.add(dep);
          }
          collectDeps(node.dependencies[dep]);
        }
      })(dependencyTree[f]);
      break;
    }
  }
  if (branchFiles.length === 0) {
    console.error("No dependency branch found for", fileKey);
    return;
  }

  // Reconstruct the encryption key as the XOR of the hashes for all non-router-dependent files in branchFiles.
  let xorResult = new Uint8Array(32);
  branchFiles.forEach(file => {
    // Extract just the file name (works for both "/" and "\")
    const fileName = file.split(/[\\/]/).pop();
    const hashHex = window.globalHashes[fileName];
    if (hashHex) {
      xorResult = xorBuffers(xorResult, hexStringToUint8Array(hashHex));
    }
  });
  if (!xorResult) {
    console.error("No hashes found for branch", branchFiles);
    return;
  }

  // Retrieve the mask from mappingForFile and XOR it with the xorResult to get the final key.
  const maskBuffer = hexStringToUint8Array(mappingForFile.mask);
  const finalKeyRaw = xorBuffers(xorResult, maskBuffer);
  console.log("xorOfHashes (hex):", uint8ArrayToHexString(xorResult));
  console.log("Final key (hex):", uint8ArrayToHexString(finalKeyRaw));

  // Import the final key as a CryptoKey for AES-CBC decryption.
  const rawKey = finalKeyRaw.buffer.slice(finalKeyRaw.byteOffset, finalKeyRaw.byteOffset + finalKeyRaw.byteLength);
  window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  ).then(cryptoKey => {
    // Look up the IV corresponding to the callString in the mapping.
    let ivBase64 = null;
    // The mappingForFile now contains a "mask" field; we iterate over other keys.
    for (const key in mappingForFile) {
      if (key === "mask") continue;
      if (key === callString) {
        ivBase64 = mappingForFile[key];
        break;
      }
    }
    if (!ivBase64) {
      console.error("No IV found for encrypted call string", callString);
      return;
    }
    const iv = base64ToArrayBuffer(ivBase64);
    const ciphertextBuffer = base64ToArrayBuffer(callString);

    return window.crypto.subtle.decrypt(
      { name: "AES-CBC", iv: iv },
      cryptoKey,
      ciphertextBuffer
    );
  }).then(plaintextBuffer => {
    const decoder = new TextDecoder();
    const plaintext = decoder.decode(plaintextBuffer);
	if(args.length === 0){
		parseAndCall(plaintext,callee);
	}else{
		parseAndCall(plaintext,callee,args);
	}

  }).catch(err => {
    console.error("Decryption failed:", err);
  });
}

/**
 * Helper: Converts a hex string to a Uint8Array.
 */
function hexStringToUint8Array(hexString) {
  if (hexString.length % 2 !== 0) {
    throw "Invalid hexString";
  }
  const array = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    array[i / 2] = parseInt(hexString.substr(i, 2), 16);
  }
  return array;
}

/**
 * Helper: XOR two Uint8Arrays of equal length.
 */
function xorBuffers(a, b) {
  if (a.length !== b.length) {
    throw "Buffers must be of equal length";
  }
  const result = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

/**
 * Helper: Converts a base64 string to an ArrayBuffer.
 */
function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

function uint8ArrayToBase64(uint8arr) {
    let binary = "";
    for (let i = 0; i < uint8arr.length; i++) {
        binary += String.fromCharCode(uint8arr[i]);
    }
    return btoa(binary);
}

function uint8ArrayToHexString(uint8arr) {
  return Array.from(uint8arr)
    .map(b => ('00' + b.toString(16)).slice(-2))
    .join('');
}

function parseAndCall(callString, caller, ...args) {
   const parts = callString.split("-");
   const fileIdentifier = parts[0];   // ad es. "file3"
   const functionName = parts[1];  // ad es. "funzioneDiFile3"
   if(args.length === 0){
	  // Divide la stringa in 4 parti separate da "-"
	  if (parts.length !== 4) {
		console.error("Formato della stringa non valido:", callString);
		return;
	  }
  
	  const paramTypesStr = parts[2];      // ad es. "string,string,boolean" oppure "null"
	  const paramValuesStr = parts[3];     // ad es. "ciao,ciao,true" oppure "null"

	  let params = [];

	  // Se entrambi i campi sono "null", significa che non ci sono parametri
	  if (paramTypesStr !== "null" && paramValuesStr !== "null") {
		// Suddivide i tipi e i valori in array usando la virgola come separatore
		const types = paramTypesStr.split(",");
		const values = paramValuesStr.split(",");

		if (types.length !== values.length) {
		  console.error("Numero di tipi e valori non corrispondente");
		  return;
		}

		// Converte ogni valore nel tipo corrispondente
		params = types.map((type, index) => {
		  let value = values[index];
		  switch (type) {
			case "string":
			  return value;
			case "number":
			  return Number(value);
			case "boolean":
			  return value.toLowerCase() === "true";
			case "object":
			  try {
				return JSON.parse(value);
			  } catch (error) {
				console.error("Errore nel parsing del parametro di tipo object:", error);
				return null;
			  }
			case "null":
			  return null;
			default:
			  console.warn("Tipo parametro non riconosciuto, trattato come stringa");
			  return value;
		  }
		});
	  }

	  // Messaggio facoltativo: puoi usare fileIdentifier per controlli aggiuntivi
	  console.log("Chiamata proveniente da:", caller);

	  // Verifica l'esistenza della funzione in window e la chiama con i parametri (se presenti)
	  if (typeof window[functionName] === 'function') {
		window[functionName](...params);
	  } else {
		console.error("La funzione " + functionName + " non esiste in window.");
	  }
	}else{
	  if (typeof window[functionName] === 'function') {
		window[functionName](...args);
	  } else {
		console.error("La funzione " + functionName + " non esiste in window.");
	  }
	}	
}


// Funzione per decodificare e parsare l’oggetto
function decodePrecomputedHashes(encodedStr) {
  try {
    const jsonStr = atob(encodedStr); // decode base64
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Errore nella decodifica degli hash precomputati:', e);
    return {};
  }
}

// Funzione per mostrare overlay
function showTamperOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'tamper-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
  overlay.style.color = '#fff';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.fontFamily = 'sans-serif';
  overlay.style.fontSize = '1.2rem';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <h1>⚠️ Codice Alterato</h1>
    <p>Il contenuto di uno o più file JavaScript è stato modificato.</p>
    <p>Accesso alla pagina bloccato.</p>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

// Funzione principale per il controllo
function verifyHashes() {
  const precomputed = decodePrecomputedHashes(PRECOMPUTED_HASHES_BASE64);
  const simplifiedPrecomputed = {};

  // Mappa { fileName: hash } dai path completi
  for (const fullPath in precomputed) {
	const fileName = fullPath.split('\\').pop(); // prendi solo "file1.js" da path
	simplifiedPrecomputed[fileName] = precomputed[fullPath];
  }

  // Confronta con window.globalHashes
  for (const file in simplifiedPrecomputed) {
    const actualHash = window.globalHashes[file];
    const expectedHash = simplifiedPrecomputed[file];

    if (!expectedHash || actualHash !== expectedHash) {
      console.warn(`Mismatch per ${file}: atteso ${expectedHash}, trovato ${actualHash}`);
      showTamperOverlay();
      return;
    }
  }

  console.log("✔️ Tutti gli hash combaciano.");
}

function waitForGlobalHashes(timeout = 5000, interval = 100) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      if (window.globalHashes && Object.keys(window.globalHashes).length > 0) {
        resolve();
      } else if (Date.now() - startTime >= timeout) {
        reject(new Error('globalHashes non disponibile dopo il timeout.'));
      } else {
        setTimeout(check, interval);
      }
    };

    check();
  });
}

// Avvia il check all’avvio del file
// Esegui il check solo quando globalHashes è disponibile
waitForGlobalHashes()
  .then(() => {
    verifyHashes(); // la tua funzione già pronta
  })
  .catch((err) => {
    console.error(err);
    showTamperOverlay(); // opzionale: blocca se plugin non caricato
  });

