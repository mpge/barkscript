# BarkScript for VS Code

Syntax highlighting, comment toggling, bracket matching and auto-indent for `.bark` files.

## Install from this repository

```sh
cd editors/vscode
npx @vscode/vsce package
code --install-extension barkscript-0.1.0.vsix
```

The grammar in `syntaxes/barkscript.tmLanguage.json` is a standard TextMate grammar, so it also
works in Sublime Text, Shiki, and anything else that reads TextMate grammars.
