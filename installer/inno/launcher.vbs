Dim shell, exe, arg
Set shell = CreateObject("WScript.Shell")

exe = WScript.Arguments(0)
arg = WScript.Arguments(1)

' 0 = hidden window, False = don't wait
shell.Run """" & exe & """ " & arg, 0, False
