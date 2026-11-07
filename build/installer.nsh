!macro customInstall
  SetOutPath "$INSTDIR"
  CopyFiles /SILENT "$EXEPATH" "$INSTDIR\NotaMentor-Setup.exe"
  CreateShortCut "$INSTDIR\NotaMentor.lnk" "$INSTDIR\NotaMentor.exe" "" "$INSTDIR\NotaMentor.ico" 0
  ; An update first runs the old uninstaller, which removes these two, so they are made on every install.
  CreateShortCut "$DESKTOP\NotaMentor.lnk" "$INSTDIR\NotaMentor.exe" "" "$INSTDIR\NotaMentor.exe" 0
  CreateShortCut "$SMPROGRAMS\NotaMentor.lnk" "$INSTDIR\NotaMentor.exe" "" "$INSTDIR\NotaMentor.exe" 0
!macroend

!macro customUnInstall
  Delete "$INSTDIR\NotaMentor.lnk"
  Delete "$INSTDIR\NotaMentor-Setup.exe"
  Delete "$DESKTOP\NotaMentor.lnk"
  Delete "$SMPROGRAMS\NotaMentor.lnk"
!macroend
