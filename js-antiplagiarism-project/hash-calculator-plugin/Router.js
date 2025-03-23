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
 * NOTE: This example assumes that the global variables DEPENDENCY_TREE_BASE64, IVS_MAPPING_BASE64, 
 * and window.globalHashes are already defined.
 */
function routerForwardCall(callString, callee) {
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
  for (const f in dependencyTree) {
    if (f.endsWith(fileKey)) {
      if (!dependencyTree[f].routerDependant) {
        branchFiles.push(f);
      }
      (function collectDeps(node) {
        for (const dep in node.dependencies) {
          if (!node.dependencies[dep].routerDependant) {
            branchFiles.push(dep);
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
      const hashBuffer = hexStringToUint8Array(hashHex);
      xorResult = xorBuffers(xorResult, hashBuffer);
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
    let callObj;
    try {
      callObj = JSON.parse(plaintext);
    } catch (error) {
      console.error("Error parsing decrypted JSON:", error);
      return;
    }
    const functionName = callObj.functionName;
    const params = callObj.params;
    console.log("Decrypted call:", functionName, params);
    if (typeof window[functionName] === "function") {
      window[functionName](...params);
    } else {
      console.error("Function " + functionName + " does not exist in window.");
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
