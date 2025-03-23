const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const subtle = crypto.webcrypto.subtle;

/**
 * Recursively retrieves all .js files from a directory,
 * converting file paths to absolute paths.
 */
function getJsFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getJsFiles(filePath));
        } else {
            if (path.extname(file) === '.js') {
                results.push(path.resolve(filePath));
            }
        }
    });
    return results;
}

/**
 * Extracts declared function names from file content.
 * Looks for function declarations in the format: function functionName( ... )
 */
function getDeclaredFunctions(content) {
    const regexDeclaration = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const declared = new Set();
    let match;
    while ((match = regexDeclaration.exec(content)) !== null) {
        declared.add(match[1]);
    }
    return declared;
}

/**
 * Extracts called function names from file content.
 * Looks for occurrences in the format: functionName(
 */
function getCalledFunctions(content) {
    const regexCall = /(\b[a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    const calls = new Set();
    let match;
    while ((match = regexCall.exec(content)) !== null) {
        calls.add(match[1]);
    }
    return calls;
}

/**
 * Analyzes a given folder to build:
 *  - A dependency tree (dependencyTree)
 *  - A dependency matrix (dependencyMatrix) containing relationships (from, to, function)
 *  - A fileContents object mapping file paths to their content.
 *
 * For routerForwardCall calls (expected format:
 *   window["routerForwardCall"]("file3-funzioneDiFile3-null-null")
 * ), it extracts the file name (up to the first dash) from the parameter,
 * finds the corresponding file in the project, adds it as a dependency, and recursively analyzes it.
 *
 * NOTE: Files inside the "recompiled" folder are filtered out.
 */
function analyzeDependencies(folderPath) {
    const recompiledFolderPath = path.resolve(folderPath, 'recompiled');
    let allFiles = getJsFiles(folderPath).filter(file => !file.startsWith(recompiledFolderPath));

    // Create an index mapping base file name (without .js) to absolute file path
    const fileBaseIndex = {};
    allFiles.forEach(file => {
        const base = path.basename(file, '.js');
        fileBaseIndex[base] = file;
    });

    // Cache file contents and declared functions for each file
    const fileContents = {};
    const fileDeclarations = {};
    allFiles.forEach(file => {
        try {
            const content = fs.readFileSync(file, 'utf8');
            fileContents[file] = content;
            fileDeclarations[file] = getDeclaredFunctions(content);
        } catch (err) {
            console.error(`Error reading file ${file}:`, err);
        }
    });

    // Build a global index: function name => file (first occurrence)
    const globalFunctionIndex = {};
    allFiles.forEach(file => {
        fileDeclarations[file].forEach(fnName => {
            if (!globalFunctionIndex[fnName]) {
                globalFunctionIndex[fnName] = file;
            }
        });
    });

    // Dependency matrix: each element is an object { from, to, function }
    const dependencyMatrix = [];

    /**
     * Recursively processes a file and returns an object with the structure:
     * { routerDependant: <true|false>, dependencies: { "<otherFile.js>": { ... } } }
     * The "visited" set prevents cycles.
     */
    function processFile(file, visited = new Set()) {
        if (visited.has(file)) return;
        visited.add(file);

        if (!(file in fileContents)) {
            console.warn(`Content not found for file: ${file}`);
            return;
        }
        const content = fileContents[file];

        // Determine if the file is router-dependent
        const routerDependant =
            content.includes('window["routerForwardCall"]') ||
            content.includes("window['routerForwardCall']");

        const dependencies = {};

        // --- Case 1: Process routerForwardCall calls ---
        const routerCallRegex = /window\[\s*["']routerForwardCall["']\s*\]\(\s*["']([^-"']+)/g;
        let match;
        while ((match = routerCallRegex.exec(content)) !== null) {
            const fileBase = match[1];
            const dependentFile = fileBaseIndex[fileBase];
            if (dependentFile && dependentFile !== file && !visited.has(dependentFile)) {
                dependencyMatrix.push({ from: file, to: dependentFile, function: `routerForwardCall(${fileBase})` });
                const child = processFile(dependentFile, new Set(visited));
                if (child) {
                    dependencies[dependentFile] = child;
                }
            }
        }

        // --- Case 2: Process normal function calls ---
        const calledFunctions = getCalledFunctions(content);
        calledFunctions.forEach(fnName => {
            if (fileDeclarations[file].has(fnName)) return;
            if (globalFunctionIndex[fnName] && allFiles.includes(globalFunctionIndex[fnName])) {
                const dependentFile = globalFunctionIndex[fnName];
                if (dependentFile !== file && !visited.has(dependentFile)) {
                    dependencyMatrix.push({ from: file, to: dependentFile, function: fnName });
                    const child = processFile(dependentFile, new Set(visited));
                    if (child) {
                        dependencies[dependentFile] = child;
                    }
                }
            }
        });

        return { routerDependant, dependencies };
    }

    const dependencyTree = {};
    allFiles.forEach(file => {
        dependencyTree[file] = processFile(file, new Set());
    });

    return { dependencyTree, dependencyMatrix, fileContents, fileBaseIndex };
}

/**
 * Converts a hex string to a Uint8Array.
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
 * XOR two Uint8Arrays of equal length.
 */
function xorBuffers(a, b) {
    if (a.length !== b.length) {
        throw "Arrays must be of equal length";
    }
    const result = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        result[i] = a[i] ^ b[i];
    }
    return result;
}

/**
 * Converts a Uint8Array to a hex string.
 */
function uint8ArrayToHexString(uint8arr) {
    return Array.from(uint8arr)
        .map(b => ('00' + b.toString(16)).slice(-2))
        .join('');
}

/**
 * Recursively collects SHA-256 hashes from dependencies that are non router-dependent.
 */
function collectHashesFromDependencies(dependencies, visited, fileContents) {
    let collected = {};
    for (const depFile in dependencies) {
        if (visited.has(depFile)) continue;
        visited.add(depFile);
        const depNode = dependencies[depFile];
        if (!depNode.routerDependant) {
            if (fileContents[depFile]) {
                // Compute SHA-256 hash as a hex string and convert to Uint8Array.
                const hashHex = crypto.createHash('sha256').update(fileContents[depFile]).digest('hex');
                const hashUint8 = hexStringToUint8Array(hashHex);
                collected[depFile] = hashUint8;
            }
        }
        const subCollected = collectHashesFromDependencies(depNode.dependencies, visited, fileContents);
        for (const key in subCollected) {
            collected[key] = subCollected[key];
        }
    }
    return collected;
}

/**
 * Generates a random Uint8Array of length n.
 */
function randomBytesUint8Array(n) {
    let arr = new Uint8Array(n);
    crypto.randomFillSync(arr);
    return arr;
}

/**
 * Computes the encryption key for a router-dependent file.
 * For a given router file, it recursively collects SHA-256 hashes of all non router-dependent dependencies,
 * XORs all the hashes together, then XORs the result with a randomly generated 32-byte mask.
 * This final value is our 256-bit encryption key.
 */
function computeKeyForRouterFile(routerFile, routerNode, fileContents) {
    const collectedHashes = collectHashesFromDependencies(routerNode.dependencies, new Set(), fileContents);
    let xorResult = new Uint8Array(32); // 32-byte array of zeros
    for (const file in collectedHashes) {
        xorResult = xorBuffers(xorResult, collectedHashes[file]);
    }
    const mask = randomBytesUint8Array(32);
    const finalKey = xorBuffers(xorResult, mask);
    return {
        routerFile,
        collectedHashes: Object.fromEntries(
            Object.entries(collectedHashes).map(([file, arr]) => [path.basename(file), uint8ArrayToHexString(arr)])
        ),
        xorOfHashes: uint8ArrayToHexString(xorResult),
        mask: uint8ArrayToHexString(mask),
        key: uint8ArrayToHexString(finalKey),
        encryptedCalls: {} // Now an object indexed numerically
    };
}

/**
 * Asynchronously encrypts a given text using AES-256-CBC with the provided 32-byte key.
 * A new 16-byte IV is generated for each encryption.
 * The final output is the ciphertext encoded in base64.
 * The IV is not concatenated to the ciphertext.
 * This function uses the Web Crypto API.
 */
async function encryptText(text, keyUint8) {
    const iv = randomBytesUint8Array(16);
    const cryptoKey = await subtle.importKey(
        "raw",
        keyUint8,
        { name: "AES-CBC" },
        false,
        ["encrypt"]
    );
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const encryptedBuffer = await subtle.encrypt(
        { name: "AES-CBC", iv: iv },
        cryptoKey,
        data
    );
    const encryptedUint8 = new Uint8Array(encryptedBuffer);
    return {
        result: uint8ArrayToBase64(encryptedUint8),
        iv: uint8ArrayToBase64(iv),
        ciphertext: uint8ArrayToBase64(encryptedUint8)
    };
}

/**
 * Helper: Converts a Uint8Array to a base64 string.
 */
function uint8ArrayToBase64(uint8arr) {
    let binary = "";
    for (let i = 0; i < uint8arr.length; i++) {
        binary += String.fromCharCode(uint8arr[i]);
    }
    return btoa(binary);
}

/**
 * Empties (removes all files and subfolders) the specified folder.
 */
function emptyFolder(folder) {
    if (fs.existsSync(folder)) {
        fs.rmSync(folder, { recursive: true, force: true });
    }
}

/**
 * Recursively copies all files and subfolders from src to dest,
 * preserving folder structure.
 */
function copyFolderRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        // Skip if the file is the current script (using __filename)
        if (!entry.isDirectory() && path.basename(srcPath) === path.basename(__filename)) {
            continue;
        }
        // Also, skip if srcPath equals the destination folder (to avoid recursion)
        if (path.resolve(srcPath) === path.resolve(dest)) {
            continue;
        }
        if (entry.isDirectory()) {
            copyFolderRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// -----------------------------------------------------------------------------
// Main execution
const folderPath = process.argv[2] || '.';
const recompiledFolder = path.join(path.resolve(folderPath), 'recompiled');

// Empty (or create) the "recompiled" folder
emptyFolder(recompiledFolder);
fs.mkdirSync(recompiledFolder, { recursive: true });
console.log(`Recompiled folder is ready at: ${recompiledFolder}`);

// Copy entire folder structure (excluding the recompiled folder) to recompiledFolder
copyFolderRecursive(folderPath, recompiledFolder);

const { dependencyTree, dependencyMatrix, fileContents, fileBaseIndex } = analyzeDependencies(folderPath);

// Debug: Print dependency tree and matrix (simplified with base file names)
console.log("Dependency Tree:");
console.log(JSON.stringify(dependencyTree, null, 2));
const simplifiedMatrix = dependencyMatrix.map(rel => ({
    From: path.basename(rel.from),
    To: path.basename(rel.to),
    Function: rel.function
}));
console.log("\nDependency Matrix:");
console.table(simplifiedMatrix);

// Prepare an object to hold encryption key details for each router-dependent file
const encryptionKeys = {};

// Process each file in the dependency tree that is router-dependent
for (const file in dependencyTree) {
    if (dependencyTree[file].routerDependant) {
        const baseName = path.basename(file);
        console.log(`Found router-dependent file: ${file}`);
        encryptionKeys[baseName] = computeKeyForRouterFile(file, dependencyTree[file], fileContents);
    }
}

console.log("\nEncryption Keys (before processing router calls):");
console.log(JSON.stringify(encryptionKeys, null, 2));

/**
 * For each router-dependent file, searches for routerForwardCall invocations,
 * encrypts the first parameter (the string inside the quotes) using the computed key,
 * and updates the file in the "recompiled" folder (preserving its relative structure)
 * with the encrypted strings replacing the original.
 * The second parameter, if present, is left unchanged.
 * Also, saves the IV and ciphertext details (in base64) into the encryptionKeys object,
 * using a numeric index that indicates the order of the calls.
 */
async function recompileRouterFiles() {
    for (const baseName in encryptionKeys) {
        // Retrieve the full path for the router file via reverse lookup using fileContents.
        const routerFile = Object.keys(fileContents).find(f => path.basename(f) === baseName);
        if (!routerFile) continue;

        const originalContent = fileContents[routerFile];
        const keyUint8 = hexStringToUint8Array(encryptionKeys[baseName].key);

        encryptionKeys[baseName].encryptedCalls = {};
        let callIndex = 1;

        // Updated regex:
        // Group 1: first parameter (to encrypt)
        // Group 2: second parameter (callee) – always present in this case
        // Group 3: optional extra parameters (including the comma and subsequent parameters)
        const routerCallRegex = /window\[\s*["']routerForwardCall["']\s*\]\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*(,.*)?\)/g;
        let modifiedContent = originalContent;
        const matches = Array.from(originalContent.matchAll(routerCallRegex));
        for (const match of matches) {
            const fullMatch = match[0];
            const p1 = match[1]; // string to encrypt
            const p2 = match[2]; // callee (always present)
            const extraParams = match[3] || ""; // e.g. ", param1, param2" (already includes a comma)
            console.log(`Encrypting parameter "${p1}" in file ${baseName}`);
            const encryptionResult = await encryptText(p1, keyUint8);
            encryptionKeys[baseName].encryptedCalls[callIndex] = {
                original: p1,
                iv: encryptionResult.iv,
                ciphertext: encryptionResult.ciphertext,
                encryptedResult: encryptionResult.result
            };
            callIndex++;
            // Build the replacement: note how il secondo parametro (p2) è chiuso tra virgolette
            // e gli extra parametri vengono aggiunti fuori dalle virgolette.
            const replacement = `window["routerForwardCall"]("${encryptionResult.result}", "${p2}"${extraParams})`;
            modifiedContent = modifiedContent.replace(fullMatch, replacement);
        }
        const relativePath = path.relative(folderPath, routerFile);
        const newFilePath = path.join(recompiledFolder, relativePath);
        fs.mkdirSync(path.dirname(newFilePath), { recursive: true });
        fs.writeFileSync(newFilePath, modifiedContent, 'utf8');
        console.log(`Recompiled file written to: ${newFilePath}`);
    }
}


// Run the recompile process
(async () => {
    await recompileRouterFiles();

    console.log("\nEncryption Keys (after processing router calls):");
    console.log(JSON.stringify(encryptionKeys, null, 2));

    /**
     * Builds an object mapping each file to an object where each key is the ciphertext (encrypted string)
     * and its value is the corresponding IV. Also includes the "mask" property.
     */
    const mapping = {};
    for (const file in encryptionKeys) {
        mapping[file] = {};
        mapping[file]["mask"] = encryptionKeys[file].mask;
        const calls = encryptionKeys[file].encryptedCalls;
        if (calls && typeof calls === "object") {
            for (const index in calls) {
                const call = calls[index];
                mapping[file][call.ciphertext] = call.iv;
            }
        }
    }
    console.log("\nMapping Object:");
    console.log(JSON.stringify(mapping, null, 2));
    const ivs_mapping = JSON.stringify(mapping, null, 2);
    const ivs_mapping_base64 = uint8ArrayToBase64(new TextEncoder().encode(ivs_mapping));
    console.log("\nIVS Mapping Object (base64 encoded):");
    console.log(ivs_mapping_base64);

    const dependency_tree = JSON.stringify(dependencyTree, null, 2);
    const dependency_tree_base64 = uint8ArrayToBase64(new TextEncoder().encode(dependency_tree));
    console.log("\nDependency Tree Object (base64 encoded):");
    console.log(dependency_tree_base64);

    /**
     * Updates the Router.js file.
     * - Recursively finds all Router.js files in the project (excluding recompiled folder),
     *   preserves their relative folder structure, and updates them with the new declarations:
     *   IVS_MAPPING_BASE64, DEPENDENCY_TREE_BASE64, and PRECOMPUTED_HASHES_BASE64.
     * - The updated files are written into the "recompiled" folder, preserving structure.
     */
    function updateRouterJS() {
        // Find all Router.js files (excluding those in recompiledFolder)
        const routerFiles = getJsFiles(folderPath).filter(file => {
            return path.basename(file) === 'Router.js' && !file.startsWith(path.resolve(folderPath, 'recompiled'));
        });
        if (routerFiles.length === 0) {
            console.warn(`No Router.js found in ${folderPath}. Creating a new Router.js at the root of recompiled folder.`);
            let routerContent = "";
            const ivsDeclaration = `const IVS_MAPPING_BASE64 = "${ivs_mapping_base64}";\n`;
            const depTreeDeclaration = `const DEPENDENCY_TREE_BASE64 = "${dependency_tree_base64}";\n`;
            const precomputedHashesDeclaration = `const PRECOMPUTED_HASHES_BASE64 = "${uint8ArrayToBase64(new TextEncoder().encode(JSON.stringify(computeHashesForJsFiles())))}";\n`;
            routerContent = ivsDeclaration + depTreeDeclaration + precomputedHashesDeclaration + routerContent;
            const newRouterPath = path.join(recompiledFolder, 'Router.js');
            fs.writeFileSync(newRouterPath, routerContent, 'utf8');
            console.log(`New Router.js written to: ${newRouterPath}`);
        } else {
            routerFiles.forEach(originalRouterPath => {
                let routerContent = fs.readFileSync(originalRouterPath, 'utf8');
                const ivsDeclaration = `const IVS_MAPPING_BASE64 = "${ivs_mapping_base64}";\n`;
                const depTreeDeclaration = `const DEPENDENCY_TREE_BASE64 = "${dependency_tree_base64}";\n`;
                const precomputedHashesDeclaration = `const PRECOMPUTED_HASHES_BASE64 = "${uint8ArrayToBase64(new TextEncoder().encode(JSON.stringify(computeHashesForJsFiles())))}";\n`;
                if (/^const\s+IVS_MAPPING_BASE64\s*=.*/m.test(routerContent)) {
                    routerContent = routerContent.replace(/^const\s+IVS_MAPPING_BASE64\s*=.*/m, ivsDeclaration.trim());
                } else {
                    routerContent = ivsDeclaration + routerContent;
                }
                if (/^const\s+DEPENDENCY_TREE_BASE64\s*=.*/m.test(routerContent)) {
                    routerContent = routerContent.replace(/^const\s+DEPENDENCY_TREE_BASE64\s*=.*/m, depTreeDeclaration.trim());
                } else {
                    routerContent = depTreeDeclaration + routerContent;
                }
                if (/^const\s+PRECOMPUTED_HASHES_BASE64\s*=.*/m.test(routerContent)) {
                    routerContent = routerContent.replace(/^const\s+PRECOMPUTED_HASHES_BASE64\s*=.*/m, precomputedHashesDeclaration.trim());
                } else {
                    routerContent = precomputedHashesDeclaration + routerContent;
                }
                const relPath = path.relative(folderPath, originalRouterPath);
                const newRouterPath = path.join(recompiledFolder, relPath);
                fs.mkdirSync(path.dirname(newRouterPath), { recursive: true });
                fs.writeFileSync(newRouterPath, routerContent, 'utf8');
                console.log(`Updated Router.js written to: ${newRouterPath}`);
            });
        }
    }

    // New Function: Computes SHA-256 hashes for all .js files in the folder and subfolders,
    // and returns an object of the form { fullPath: hash }.
    // EXCLUDES files whose basename is "Router.js".
    function computeHashesForJsFiles() {
        const files = getJsFiles(path.resolve(folderPath, 'recompiled')).filter(file => {
            return path.extname(file) === '.js' && path.basename(file) !== 'Router.js';
        });
        const hashObj = {};
        files.forEach(file => {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const hashHex = crypto.createHash('sha256').update(content).digest('hex');
                hashObj[file] = hashHex;
            } catch (err) {
                console.error(`Error reading or hashing file ${file}:`, err);
            }
        });
        return hashObj;
    }

    updateRouterJS();
})();
