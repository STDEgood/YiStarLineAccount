' YiStarLine Account - silent launcher (no console window)
' Double-click this file to start the local SSO service and open the app window.
Option Explicit

Dim fso, shell, here, root, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
cmd = here & "\start-app.cmd"

If Not fso.FileExists(cmd) Then
  MsgBox "start-app.cmd not found next to this launcher.", 16, "YiStarLine Account"
  WScript.Quit 1
End If

shell.CurrentDirectory = root
shell.Run """" & cmd & """", 0, False
