-- «Установка ЭЦП в Safari»: мастер установки из DMG на нативных окнах macOS.
-- Копирует выбранные приложения в «Программы», подписывает их сертификатом пользователя
-- (бесплатный Apple Development) или оставляет без подписи, запускает и подсказывает, что включить в Safari.
--
-- Сборка: osacompile -o "Установка ЭЦП в Safari.app" tools/install-wizard.applescript
-- Тест без окон: NMA_TEST=1 NMA_SRC=<папка с .app> NMA_DEST=<куда ставить> [NMA_PICK=1,3] [NMA_SIGN=1]
--                [NMA_IDENTITY_FILTER=...] osascript tools/install-wizard.applescript
property T : "Установка ЭЦП в Safari"
property testMode : false
property idFilter : "Apple Development"

-- приложения: имя, назначение, bundle id, файл манифеста плагина, название плагина, где скачать плагин
property appNames : {"Gosplugin Safari", "Kontur Safari", "CryptoPro Safari"}
property appTitles : {"Gosplugin Safari — Госуслуги (Госплагин)", "Kontur Safari — Диадок и сервисы Контура (Контур.Плагин)", "CryptoPro Safari — ФНС (nalog.ru) и другие сайты (КриптоПро ЭЦП Browser plug-in)"}
property appIds : {"local.safaricrypto.gosplugin", "local.safaricrypto.kontur", "local.safaricrypto.cryptopro"}
property hostFiles : {"chrome.gosuslugi.plugin.json", "kontur.plugin.json", "ru.cryptopro.nmcades.json"}
property pluginNames : {"Госплагин", "Контур.Плагин", "КриптоПро ЭЦП Browser plug-in"}
property pluginUrls : {"https://www.gosuslugi.ru/landing/gosplugin", "https://install.kontur.ru", "https://www.cryptopro.ru/products/cades/plugin"}

on getEnv(varName)
	try
		return system attribute varName
	on error
		return ""
	end try
end getEnv

on askUser(msg, btnList, defBtn)
	if testMode then return defBtn
	activate
	with timeout of 86400 seconds
		return button returned of (display dialog msg with title T buttons btnList default button defBtn with icon note)
	end timeout
end askUser

on sh(cmd)
	with timeout of 86400 seconds
		return do shell script cmd
	end timeout
end sh

on shAdmin(cmd)
	return do shell script cmd with administrator privileges
end shAdmin

on joinList(lst, sep)
	set AppleScript's text item delimiters to sep
	set s to lst as text
	set AppleScript's text item delimiters to ""
	return s
end joinList

on indexOf(x, lst)
	repeat with i from 1 to count of lst
		if item i of lst is x then return i
	end repeat
	return 0
end indexOf

on hostInstalled(f)
	set p1 to "/Library/Google/Chrome/NativeMessagingHosts/" & f
	set p2 to (POSIX path of (path to home folder)) & "Library/Application Support/Google/Chrome/NativeMessagingHosts/" & f
	return (sh("test -f " & quoted form of p1 & " -o -f " & quoted form of p2 & " && echo y || echo n") is "y")
end hostInstalled

-- куда ставить: если приложение уже установлено (например, в ~/Applications), заменяем ту копию, чтобы не было дублей
on targetFor(i, destDir)
	set nm to item i of appNames
	if destDir is not "" then return destDir & "/" & nm & ".app"
	try
		set found to sh("mdfind \"kMDItemCFBundleIdentifier == '" & item i of appIds & "'\" 2>/dev/null | grep -E '^(/Applications|" & (POSIX path of (path to home folder)) & "Applications)/[^/]+\\.app$' | head -1")
		if found is not "" then return found
	end try
	return "/Applications/" & nm & ".app"
end targetFor

on findIdentities()
	try
		return paragraphs of sh("security find-identity -v -p codesigning 2>/dev/null | grep " & quoted form of idFilter & " | sed -E 's/^ *[0-9]+\\) //'")
	on error
		return {}
	end try
end findIdentities

on hasXcode()
	return (sh("/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild -version >/dev/null 2>&1 && echo y || echo n") is "y")
end hasXcode

-- Промежуточный сертификат Apple: без него сертификат виден только в find-identity без -v.
on fixIntermediate()
	try
		if (sh("security find-identity -p codesigning 2>/dev/null | grep -c " & quoted form of idFilter & " || true") as integer) > 0 then
			sh("curl -fsSL -o /tmp/AppleWWDRCAG3.cer https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer && security import /tmp/AppleWWDRCAG3.cer -k ~/Library/Keychains/login.keychain-db")
		end if
	end try
end fixIntermediate

on run
	set testMode to (getEnv("NMA_TEST") is not "")
	if getEnv("NMA_IDENTITY_FILTER") is not "" then set idFilter to getEnv("NMA_IDENTITY_FILTER")
	try
		-- пользователь может долго ставить Xcode: без этого AppleScript обрывает вызовы через 2 минуты (ошибка -1712)
		with timeout of 86400 seconds
			return my wizard()
		end timeout
	on error msg number n
		if n is -128 then return -- «Отмена»
		if testMode then error msg number n
		display dialog "Ошибка:" & return & msg with title T buttons {"OK"} default button "OK" with icon stop
	end try
end run

on wizard()
	set srcDir to getEnv("NMA_SRC")
	if srcDir is "" then set srcDir to sh("dirname " & quoted form of POSIX path of (path to me))
	set destDir to getEnv("NMA_DEST")

	-- Шаг 1. Что ставить
	set r to askUser("Мастер установит приложения, с которыми электронная подпись работает в Safari: вход и подписание документов на Госуслугах, в Диадоке, на nalog.ru и других сайтах." & return & return & ¬
		"• Gosplugin Safari — Госуслуги" & return & ¬
		"• Kontur Safari — Диадок и сервисы Контура" & return & ¬
		"• CryptoPro Safari — ФНС и сайты с КриптоПро ЭЦП Browser plug-in" & return & return & ¬
		"Установить все или выбрать нужные?", {"Отмена", "Выбрать…", "Установить все"}, "Установить все")
	if r is "Отмена" then error number -128
	set picked to {1, 2, 3}
	if testMode and getEnv("NMA_PICK") is not "" then
		set AppleScript's text item delimiters to ","
		set picked to {}
		repeat with s in text items of getEnv("NMA_PICK")
			set end of picked to (s as integer)
		end repeat
		set AppleScript's text item delimiters to ""
	else if r is "Выбрать…" then
		activate
		set ch to choose from list appTitles with title T with prompt "Отметьте нужные приложения (⌘-щелчок — несколько):" default items appTitles with multiple selections allowed
		if ch is false then error number -128
		set picked to {}
		repeat with c in ch
			set end of picked to indexOf(c as text, appTitles)
		end repeat
	end if

	-- приложения должны лежать рядом с мастером
	repeat with k from 1 to count of picked
		set i to item k of picked
		set src to srcDir & "/" & item i of appNames & ".app"
		try
			sh("test -d " & quoted form of src)
		on error
			error "Не нахожу «" & item i of appNames & ".app» рядом с мастером. Запустите мастер из окна образа ESign-Safari.dmg."
		end try
	end repeat

	-- Шаг 2. Нужные плагины и КриптоПро CSP
	set missing to {}
	set urls to {}
	if sh("test -d /opt/cprocsp && echo y || echo n") is "n" then
		set end of missing to "КриптоПро CSP"
		set end of urls to "https://www.cryptopro.ru/products/csp/downloads"
	end if
	repeat with k from 1 to count of picked
		set i to item k of picked
		if not hostInstalled(item i of hostFiles) then
			set end of missing to (item i of pluginNames) & " (для " & item i of appNames & ")"
			set end of urls to item i of pluginUrls
		end if
	end repeat
	if (count of missing) > 0 then
		set r to askUser("Не найдено:" & return & "• " & joinList(missing, return & "• ") & return & return & ¬
			"Без этого электронная подпись в Safari работать не будет. Приложения можно поставить сейчас, а плагины — позже, обычными установщиками для macOS. Chrome не нужен.", {"Отмена", "Открыть страницы загрузки", "Продолжить"}, "Продолжить")
		if r is "Отмена" then error number -128
		if r starts with "Открыть" then
			repeat with u in urls
				sh("open " & quoted form of (u as text))
			end repeat
		end if
	end if

	-- Шаг 3. Подпись
	set idents to findIdentities()
	set signMsg to "Safari загружает расширения только из подписанных приложений." & return & return & ¬
		"• Подписать своим сертификатом (рекомендуется) — один раз, и Safari больше ничего не спрашивает. Нужен бесплатный сертификат Apple Development: "
	if (count of idents) > 0 then
		set signMsg to signMsg & "он у вас уже есть."
	else
		set signMsg to signMsg & "мастер поможет получить его через Xcode и ваш Apple ID."
	end if
	set signMsg to signMsg & return & "• Без подписи — ничего ставить не нужно, но после каждого перезапуска Safari придётся включать «Разработка → Разрешить неподписанные расширения»."
	set r to askUser(signMsg, {"Отмена", "Без подписи", "Подписать своим сертификатом"}, "Подписать своим сертификатом")
	if r is "Отмена" then error number -128
	set doSign to (r starts with "Подписать")
	if testMode then set doSign to (getEnv("NMA_SIGN") is not "")
	set ident to ""
	if doSign then set ident to my obtainIdentity()

	-- Шаг 4. Safari должен быть закрыт, иначе при замене приложения он отключит расширение
	if not testMode then
		if sh("pgrep -x Safari >/dev/null && echo y || echo n") is "y" then
			set r to askUser("Нужно закрыть Safari: если заменить приложение при открытом Safari, он может отключить расширение." & return & return & "Открытые вкладки Safari восстановит при следующем запуске.", {"Отмена", "Закрыть Safari"}, "Закрыть Safari")
			if r is "Отмена" then error number -128
			tell application "Safari" to quit
			repeat 30 times
				if sh("pgrep -x Safari >/dev/null && echo y || echo n") is "n" then exit repeat
				delay 1
			end repeat
		end if
	end if

	-- Шаг 5. Копирование и подпись
	set total to count of picked
	set progress total steps to total
	set progress completed steps to 0
	set progress description to "Устанавливаю…"
	set installed to {}
	set n to 0
	repeat with k from 1 to count of picked
		set i to item k of picked
		set nm to item i of appNames
		set progress additional description to nm
		set src to srcDir & "/" & nm & ".app"
		set target to targetFor(i, destDir)
		set q to quoted form of target
		if not testMode then sh("pkill -x " & quoted form of nm & " || true")
		set cpCmd to "rm -rf " & q & " && mkdir -p \"$(dirname " & q & ")\" && ditto " & quoted form of src & " " & q & " && xattr -cr " & q
		try
			sh(cpCmd)
		on error
			shAdmin(cpCmd & " && chown -R " & (do shell script "id -un") & " " & q)
		end try
		if ident is not "" then
			sh("for A in " & q & "/Contents/PlugIns/*.appex " & q & "; do codesign --force --sign " & ident & " --preserve-metadata=entitlements --options runtime \"$A\" 2>&1 || exit 1; done")
			sh("codesign --verify --deep --strict " & q & " 2>&1")
		end if
		-- запуск: приложение ставит фоновый мост в автозапуск и регистрирует расширение в Safari
		if not testMode then sh("open " & q)
		set end of installed to target
		set n to n + 1
		set progress completed steps to n
	end repeat

	-- Шаг 6. Что дальше
	set msg to "Установлено:" & return & "• " & joinList(installed, return & "• ") & return & return
	if ident is "" then
		set msg to msg & "Приложения не подписаны. В Safari: Настройки → Дополнения → «Показывать функции для веб-разработчиков», затем в строке меню «Разработка → Разрешить неподписанные расширения» (после каждого перезапуска Safari)." & return & return
	else
		set msg to msg & "Приложения подписаны вашим сертификатом. Он действует год; после обновления приложений запустите мастер снова." & return & return
	end if
	set msg to msg & "Осталось включить расширения: в окне каждого приложения нажмите «Открыть настройки Safari…», поставьте галочку у расширения, затем «Изменить сайты…» → «Разрешить». Когда в окне все три пункта зелёные — всё готово." & return & return & ¬
		"Если macOS спросит доступ к ключу при подписи — «Всегда разрешать»."
	if testMode then return "TEST-OK " & joinList(installed, ", ") & " ident=" & ident
	askUser(msg, {"Готово"}, "Готово")
end wizard

-- сертификат Apple Development: выбрать из имеющихся или провести через Xcode
on obtainIdentity()
	fixIntermediate()
	set idents to findIdentities()
	repeat while (count of idents) is 0
		if not hasXcode() then
			set r to askUser("Подпись, шаг 1 из 2: установите Xcode." & return & "Он бесплатный (~10 ГБ) и нужен только чтобы получить сертификат; потом его можно удалить.", {"Отмена", "Проверить", "Открыть App Store"}, "Открыть App Store")
			if r is "Отмена" then error number -128
			if r starts with "Открыть" then sh("open macappstore://apps.apple.com/app/id497799835")
			if testMode then error "Xcode не установлен."
		else
			set r to askUser("Подпись, шаг 2 из 2: выпустите сертификат в Xcode." & return & return & ¬
				"1. Xcode → Settings… (⌘,) → Apple Accounts" & return & ¬
				"2. «+» → Apple ID → войдите своим Apple ID" & return & ¬
				"3. Выберите аккаунт → Manage Certificates…" & return & ¬
				"4. Внизу слева «+» → Apple Development" & return & return & ¬
				"Потом нажмите «Проверить». Окно мастера скрылось — нажмите его значок в Dock.", {"Отмена", "Открыть Xcode", "Проверить"}, "Проверить")
			if r is "Отмена" then error number -128
			if r starts with "Открыть" then
				sh("open -a Xcode")
				delay 6
			end if
			if testMode then error "Сертификат не найден."
		end if
		fixIntermediate()
		set idents to findIdentities()
		if (count of idents) is 0 and (r is "Проверить") then display notification "Сертификат пока не найден" with title T
	end repeat
	set chosen to item 1 of idents
	if (count of idents) > 1 and not testMode then
		activate
		set ch to choose from list idents with title T with prompt "Каким сертификатом подписать?" default items {item 1 of idents}
		if ch is false then error number -128
		set chosen to item 1 of ch
	end if
	return word 1 of chosen -- SHA-1 отпечаток
end obtainIdentity
