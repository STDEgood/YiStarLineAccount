' YiStarLine Account - start the local service only (no window).
' Used by the "start with Windows" entry: products can sign in without the manager window.
Option Explicit

Dim fso, shell, here, root, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
cmd = here & "\start-service.cmd"

If Not fso.FileExists(cmd) Then
  WScript.Quit 1
End If

shell.CurrentDirectory = root
shell.Run """" & cmd & """", 0, False
