This project was created with the goal of implementing a mechanism to protect JavaScript source code from plagiarism.

It is essentially composed of a browser extension (hash-calculator-plugin), a script to be executed via Node.js version 18 or higher (required for the Web Crypto API functionality), and a JavaScript script to be imported into the project that is intended to be protected.

The purpose of the extension is to compute the hashes of the JavaScript files loaded by the web page. Installing the plugin is essential in order to use this approach.

How the NodeJS script Works?

  To run the script, open your terminal, navigate to the directory containing the script, and execute:
  
    node RouterCallsCreator.js [path-to-project-folder]
  
  If the optional parameter is omitted, the script will default to processing the current folder.

  The script performs the following steps:
  
    1) Project Analysis and Recompilation:
       The script scans your entire project (excluding the "recompiled" folder) to build a dependency tree and a dependency matrix based on the JavaScript files. It then "recompiles" the project by copying all files into a new folder named recompiled, preserving the original folder structure.
  
    2) Router.js update:
       During the recompilation process, the script updates the Router.js file with global parameters that are essential for the application's functioning; it is fundamental that the programmer must ensure, before running the script, that Router.js is included in the project and that any function calls to be protected have been replaced with the corresponding calls that redirect them to Router.js (see below for details).
       
    3) Encrypted Call Replacement:
    The script also processes your project files by searching for existing routerForwardCall invocations. It replaces these calls with equivalent calls that use an encrypted first parameter. This ensures that the original function calls—modified previously by the developer to be forwarded through Router.js—are now substituted with secure, encrypted versions. The second parameter (which indicates the target/callee) and any additional parameters are preserved.
  
  By following these steps, the script automates the creation of a recompiled version of your project that uses a new, fully configured Router.js file and converts designated function calls into their encrypted counterparts. This setup is critical for ensuring that your function calls are securely routed through Router.js during runtime.

How to replace calls before running the script ?

  In addition to the automated processing performed by the script, the developer is expected to manually update their code to replace direct function calls with calls to the Router module. 
  This means that, before running the script, you must review your source code and substitute function calls you want to protect with corresponding calls to the Router.js module. The Router.js module is designed to handle these calls using its precomputed encryption and dependency mapping.
  
  For example:
  
    file1.js
      function iWantToProtectCallsToIt(param1, param2){ ... }
      
    And file2.js:
      function somefunction { 
          ...
          ...
          iWantToProtectCallsToIt(param1, param2);
          ...
          ...
      }
  
  You should replace in file2.js the call to "iWantToProtectCallsToIt" like this:

      And file2.js:
        function somefunction { 
            ...
            ...
            window["routerForwardCall"]("file1-iWantToProtectCallsToIt", "file2", param1, param2);
            ...
            ...
        }
  More in general you can replace calls in 2 ways:

    1) Static parameters syntax:
    
         window["routerForwardCall"]("filename-functioname-parametersTypeDividedByComma-parametersValueDividedByComma", "calleeFileName");

         An example:
           window["routerForwardCall"]("file3-funct1-Number,String-7,hello", "calleeFileName");

         or if the function has no parameters:

           window["routerForwardCall"]("file3-funct1-null-null", "calleeFileName");

           
    2) Dynamic parameters

         window["routerForwardCall"]("filename-functioname", "calleeFileName", param1, ..., paramN);


  HOW TO SETUP THE ENTIRE PROJECT?

  1) Import Router.js in your project (import it in the html).
  2) Replace function calls you want to protect in your files .js with equivalent routerForwardCall.
  3) Run the NodeJS script RouterCallsCreator.js [projectFolderPath]
      
