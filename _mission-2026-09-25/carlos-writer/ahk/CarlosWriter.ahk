#Requires AutoHotkey v2.0
#SingleInstance Force
; =============================================================================
; Carlos Writer, global hotkey version. OPTIONAL. NOT INSTALLED. NOT RUN YET.
;
; What it does: press Ctrl+Alt+Shift+W in almost any Windows app with text
; selected. It copies the selection, asks the local model (Ollama on this PC),
; and shows Original and Suggestion. Nothing changes unless you click Replace,
; which pastes the suggestion over your selection. Copy and Cancel never touch
; the app. Your clipboard is restored afterwards.
;
; It refuses to run on: windows running as administrator, password boxes
; (Win32 and UI Automation), terminals, password managers and remote desktop.
; It sends text only to http://localhost:11434 (Ollama). No internet, no API.
;
; Honest limits (see WRITER_README.md): written against the AutoHotkey v2.0
; documentation but never executed (the build machine is Linux). No word-level
; diff highlighting here. Paste replaces formatting inside the selection with
; plain text. If the app drops the selection while the preview is open, Replace
; pastes at the cursor instead: Ctrl+Z undoes it.
; The browser extension is the recommended route. Use this only if you want the
; same thing outside the browser, after you have tried it on throwaway text.
; =============================================================================

global CW := {
    hotkey: "^!+w",
    endpoint: "http://localhost:11434/api/chat",
    model: "llama3.1:8b",
    promptsFile: A_ScriptDir "\prompts.txt",
    styleGuideFile: A_ScriptDir "\style-guide.txt",
    receiveTimeoutMs: 180000,
    maxChars: 12000
}

; Apps where sending Ctrl+C is unsafe or pointless (terminals treat Ctrl+C as "stop").
global CW_SKIP_EXE := Map(
    "windowsterminal.exe", "a terminal", "cmd.exe", "a terminal", "conhost.exe", "a terminal",
    "powershell.exe", "a terminal", "pwsh.exe", "a terminal", "wt.exe", "a terminal",
    "mintty.exe", "a terminal", "putty.exe", "a terminal",
    "keepass.exe", "a password manager", "keepassxc.exe", "a password manager",
    "1password.exe", "a password manager", "bitwarden.exe", "a password manager",
    "mstsc.exe", "a remote desktop window", "consent.exe", "a Windows security prompt",
    "logonui.exe", "a Windows security prompt"
)

global CW_PROMPTS := LoadPrompts(CW.promptsFile)

A_IconTip := "Carlos Writer (local model). Hotkey: Ctrl+Alt+Shift+W"
A_TrayMenu.Add()
A_TrayMenu.Add("Edit style guide", (*) => Run('notepad.exe "' CW.styleGuideFile '"'))
Hotkey(CW.hotkey, StartWriter)

; -----------------------------------------------------------------------------

StartWriter(*) {
    hwnd := WinExist("A")
    if !hwnd
        return
    exe := ""
    try exe := StrLower(WinGetProcessName(hwnd))
    if CW_SKIP_EXE.Has(exe)
        return Notify("Carlos Writer skipped: this is " CW_SKIP_EXE[exe] ".")
    if (IsWindowElevated(hwnd) && !A_IsAdmin)
        return Notify("Carlos Writer skipped: this window runs as administrator, so it can't be read or pasted into safely.")
    if FocusedIsPassword()
        return Notify("Carlos Writer skipped: this is a password field.")

    saved := ClipboardAll()
    A_Clipboard := ""
    Send "^c"
    gotText := ClipWait(1.0)
    text := gotText ? A_Clipboard : ""
    A_Clipboard := saved      ; give the clipboard back right away
    saved := ""
    if (Trim(text, " `t`r`n") = "")
        return Notify("Select some text first, then press Ctrl+Alt+Shift+W.")
    if (StrLen(text) > CW.maxChars)
        return Notify("That selection is too long (" StrLen(text) " characters). The limit is " CW.maxChars ".")

    m := Menu()
    for i, p in CW_PROMPTS
        m.Add("&" i "  " p.label, RunAction.Bind(p, text, hwnd))
    m.Add()
    m.Add("Cancel", (*) => 0)
    m.Show()
}

RunAction(prompt, text, hwnd, *) {
    ; Keep the spaces around the selection; send only the core text.
    RegExMatch(text, "s)^(\s*)(.*?)(\s*)$", &parts)
    core := parts[2]
    guide := FileExist(CW.styleGuideFile) ? Trim(FileRead(CW.styleGuideFile, "UTF-8"), " `t`r`n") : ""
    system := StrReplace(prompt.system, "{{STYLE_GUIDE}}", guide)
    user := StrReplace(prompt.user, "{{TEXT}}", core)
    numPredict := Min(4096, Max(256, Ceil(StrLen(core) / 3.6 * 2.5) + 64))
    body := '{"model":"' JsonEscape(CW.model) '","stream":false,"think":false,'
        . '"messages":[{"role":"system","content":"' JsonEscape(system) '"},'
        . '{"role":"user","content":"' JsonEscape(user) '"}],'
        . '"options":{"temperature":' prompt.temperature ',"top_p":0.9,"num_ctx":8192,"num_predict":' numPredict '}}'

    ToolTip("Carlos Writer: " prompt.label "… (local model)")
    started := A_TickCount
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.SetTimeouts(5000, 5000, 30000, CW.receiveTimeoutMs)
        req.Open("POST", CW.endpoint, false)
        req.SetRequestHeader("Content-Type", "application/json; charset=utf-8")
        req.Send(Utf8Bytes(body))
        status := req.Status
        response := Utf8Text(req.ResponseBody)
    } catch as e {
        ToolTip()
        return Notify("Can't reach Ollama at localhost:11434. Is the Ollama app running? (" e.Message ")")
    }
    ToolTip()
    seconds := Round((A_TickCount - started) / 1000, 1)
    if (status = 404)
        return Notify("The model " CW.model " is not installed. If you want it: ollama pull " CW.model)
    if (status != 200)
        return Notify("Ollama answered HTTP " status ".")
    suggestion := CleanOutput(JsonContent(response))
    if (suggestion = "")
        return Notify("The model returned an empty answer. Try again.")
    ShowPreview(prompt, core, suggestion, parts[1], parts[3], hwnd, MissingFacts(core, suggestion), seconds)
}

ShowPreview(prompt, original, suggestion, lead, trail, hwnd, missing, seconds) {
    g := Gui("+AlwaysOnTop", "Carlos Writer · " prompt.label)
    g.SetFont("s10", "Segoe UI")
    g.Add("Text", "w600", "Original")
    g.Add("Edit", "w600 r6 ReadOnly", original)
    g.Add("Text", "w600", "Suggestion")
    g.Add("Edit", "w600 r6 ReadOnly", suggestion)
    if (missing != "")
        g.Add("Text", "w600 cMaroon", "Check before you replace. Not found in the suggestion: " missing)
    g.Add("Text", "w600 cGray", CW.model " on this computer · " seconds " s. Replace pastes over your selection; Ctrl+Z undoes it in most apps.")
    replaceBtn := g.Add("Button", "w110", "&Replace")
    copyBtn := g.Add("Button", "x+10 w110", "&Copy")
    cancelBtn := g.Add("Button", "x+10 w110", "Cancel")
    replaceBtn.OnEvent("Click", (*) => (g.Destroy(), PasteInto(hwnd, lead suggestion trail)))
    copyBtn.OnEvent("Click", (*) => (A_Clipboard := suggestion, g.Destroy(), Notify("Copied.")))
    cancelBtn.OnEvent("Click", (*) => (g.Destroy(), TryActivate(hwnd)))
    g.OnEvent("Escape", (*) => (g.Destroy(), TryActivate(hwnd)))
    g.OnEvent("Close", (*) => TryActivate(hwnd))
    g.Show("AutoSize Center")
    cancelBtn.Focus()          ; Enter never replaces by accident
}

PasteInto(hwnd, newText) {
    if !WinExist("ahk_id " hwnd)
        return Notify("That window is gone. Nothing was pasted.")
    TryActivate(hwnd)
    if !WinWaitActive("ahk_id " hwnd, , 2)
        return Notify("Couldn't return to the original window. Nothing was pasted. Use Copy instead.")
    saved := ClipboardAll()
    A_Clipboard := newText
    if !ClipWait(1.0) {
        A_Clipboard := saved
        return Notify("Couldn't use the clipboard. Nothing was pasted.")
    }
    Send "^v"
    Sleep 400                  ; let the app read the clipboard before restoring it
    A_Clipboard := saved
}

TryActivate(hwnd) {
    try WinActivate("ahk_id " hwnd)
}

Notify(msg) {
    ToolTip(msg)
    SetTimer(() => ToolTip(), -3500)
}

; ---- Safety checks -----------------------------------------------------------

IsWindowElevated(hwnd) {
    try pid := WinGetPID("ahk_id " hwnd)
    catch
        return true
    hProc := DllCall("OpenProcess", "UInt", 0x1000, "Int", false, "UInt", pid, "Ptr")  ; PROCESS_QUERY_LIMITED_INFORMATION
    if !hProc
        return true            ; can't even query it: treat as protected and skip
    hToken := 0
    ok := DllCall("advapi32\OpenProcessToken", "Ptr", hProc, "UInt", 0x0008, "Ptr*", &hToken)  ; TOKEN_QUERY
    DllCall("CloseHandle", "Ptr", hProc)
    if !ok
        return true
    elevated := 0, size := 0
    DllCall("advapi32\GetTokenInformation", "Ptr", hToken, "Int", 20, "UInt*", &elevated, "UInt", 4, "UInt*", &size)  ; TokenElevation
    DllCall("CloseHandle", "Ptr", hToken)
    return elevated != 0
}

FocusedIsPassword() {
    ; 1) Classic Win32 edit box with the ES_PASSWORD style.
    try {
        ctl := ControlGetFocus("A")
        if (ctl && InStr(WinGetClass("ahk_id " ctl), "Edit") && (ControlGetStyle(ctl) & 0x20))
            return true
    }
    ; 2) UI Automation, which also covers browsers and modern apps.
    try {
        uia := ComObject("{ff48dba4-60ef-4201-aa87-54103eef594e}", "{30cbe57d-d9d0-452a-ab13-7ac5ac4825ee}")
        el := 0
        ComCall(8, uia, "Ptr*", &el)             ; IUIAutomation::GetFocusedElement
        if el {
            isPassword := 0
            ComCall(35, el, "Int*", &isPassword) ; IUIAutomationElement::get_CurrentIsPassword
            ObjRelease(el)
            return isPassword != 0
        }
    }
    return false
}

; ---- Prompts, JSON and text helpers -----------------------------------------------

LoadPrompts(path) {
    if !FileExist(path)
        throw Error("prompts.txt is missing next to the script: " path)
    raw := StrReplace(FileRead(path, "UTF-8"), "`r`n", "`n")
    list := []
    pos := 1
    while RegExMatch(raw, "s)=== (\w+) \| (.+?) \| temperature=([\d.]+)\n--- system\n(.*?)\n--- user\n(.*?)\n(?==== )", &m, pos) {
        list.Push({ id: m[1], label: m[2], temperature: m[3], system: m[4], user: m[5] })
        pos := m.Pos + m.Len
    }
    if (list.Length = 0)
        throw Error("No prompts found in " path)
    return list
}

JsonEscape(s) {
    s := StrReplace(s, "\", "\\")
    s := StrReplace(s, '"', '\"')
    s := StrReplace(s, "`r", "\r")
    s := StrReplace(s, "`n", "\n")
    s := StrReplace(s, "`t", "\t")
    out := ""
    loop parse s {
        c := Ord(A_LoopField)
        out .= (c < 0x20) ? Format("\u{:04x}", c) : A_LoopField
    }
    return out
}

JsonContent(json) {
    ; Ollama's non-streaming reply: {"model":..,"message":{"role":"assistant","content":"..."},...}
    if !RegExMatch(json, 's)"content"\s*:\s*"((?:[^"\\]|\\.)*)"', &m)
        return ""
    return JsonUnescape(m[1])
}

JsonUnescape(s) {
    out := ""
    i := 1
    n := StrLen(s)
    while (i <= n) {
        ch := SubStr(s, i, 1)
        if (ch != "\") {
            out .= ch, i += 1
            continue
        }
        nx := SubStr(s, i + 1, 1)
        switch nx {
            case '"': out .= '"'
            case "\": out .= "\"
            case "/": out .= "/"
            case "b": out .= Chr(8)
            case "f": out .= Chr(12)
            case "n": out .= "`n"
            case "r": out .= "`r"
            case "t": out .= "`t"
            case "u":
                code := Integer("0x" SubStr(s, i + 2, 4))
                if (code >= 0xD800 && code <= 0xDBFF && SubStr(s, i + 6, 2) = "\u") {
                    low := Integer("0x" SubStr(s, i + 8, 4))
                    code := 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
                    i += 6
                }
                out .= Chr(code)
                i += 4
            default: out .= nx
        }
        i += 2
    }
    return out
}

CleanOutput(s) {
    s := RegExReplace(s, "s)<think>.*?</think>\s*")
    s := Trim(s, " `t`r`n")
    s := RegExReplace(s, "s)^``````[a-zA-Z]*\n(.*?)\n?``````$", "$1")
    s := RegExReplace(s, "is)^<(passage|text|result|output)>\s*(.*?)\s*</\1>$", "$2")
    s := RegExReplace(s, "i)^(here('s| is| are)|sure|certainly|of course|okay|aqu[ií] (est[aá]|tienes|va)|claro)[^\n]{0,120}:[ \t]*\n+")
    return Trim(s, " `t`r`n")
}

MissingFacts(original, suggestion) {
    missing := []
    digits := " " RegExReplace(suggestion, "\D+", " ") " "
    pos := 1
    while RegExMatch(original, "\d+(?:[.,:/-]\d+)*", &m, pos) {
        d := RegExReplace(m[0], "\D")
        if !InStr(digits, " " d " ") && !InStr(RegExReplace(suggestion, "[^\d]"), d)
            missing.Push(m[0])
        pos := m.Pos + m.Len
    }
    pos := 1
    while RegExMatch(original, "https?://[^\s<>`"')\]]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+", &m, pos) {
        v := RTrim(m[0], ".,;:!?")
        if !InStr(suggestion, v, true)
            missing.Push(v)
        pos := m.Pos + m.Len
    }
    out := ""
    for v in missing
        out .= (out = "" ? "" : ", ") v
    return out
}

Utf8Bytes(str) {
    ; WinHttp sends a SAFEARRAY of bytes as-is, so the body is exact UTF-8.
    size := StrPut(str, "UTF-8") - 1   ; bytes without the terminating null
    buf := Buffer(size + 1)
    StrPut(str, buf, "UTF-8")
    arr := ComObjArray(0x11, size)   ; VT_UI1
    loop size
        arr[A_Index - 1] := NumGet(buf, A_Index - 1, "UChar")
    return arr
}

Utf8Text(body) {
    ; ResponseBody is a byte SAFEARRAY; decode it as UTF-8 ourselves.
    size := body.MaxIndex() + 1
    buf := Buffer(size)
    loop size
        NumPut("UChar", body[A_Index - 1], buf, A_Index - 1)
    return StrGet(buf, size, "UTF-8")
}
