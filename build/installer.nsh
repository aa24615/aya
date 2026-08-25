!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\aya" "" "URL:AYA-Plus Protocol"
  WriteRegStr SHELL_CONTEXT "Software\Classes\aya" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\aya\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\aya\shell\open\command" "" '"$appExe" "%1"'
!macroend

!macro customUnInstall
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\aya\shell\open\command" ""
  StrCpy $R1 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  StrCmp $R0 $R1 0 +2
  DeleteRegKey SHELL_CONTEXT "Software\Classes\aya"
!macroend
