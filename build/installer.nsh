!macro customInstall
  CreateDirectory "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
  CreateShortCut "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCT_FILENAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!macroend

!macro customUnInstall
  Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${PRODUCT_FILENAME}.lnk"
!macroend
