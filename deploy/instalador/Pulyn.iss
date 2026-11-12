; Pulyn.iss - instalador (setup.exe) do Pulyn para o servidor Windows/IIS de um buffet.
; Nao compile direto: use gerar-instalador.ps1, que monta a pasta "montagem" (sistema compilado + instaladores) e chama o ISCC.
;
; A segunda tela pergunta o que fazer:
;   Primeira instalacao: pede IP, senha do postgres e usuario master; copia o pacote para C:\Pulyn\pacote e roda
;                        BackEnd\deploy\iis\instalar-tudo.ps1 -Modo Instalar
;   Atualizar pela internet: roda atualizar-github.ps1 (git pull da main do GitHub, so o que mudou, backup e publicacao)
;   Atualizar com este instalador: copia o pacote e roda instalar-tudo.ps1 -Modo Atualizar (sem internet)
;   Desinstalar:         roda desinstalar.ps1 (o banco so e apagado se a pessoa marcar, com backup antes)
; Uma janela do PowerShell mostra o andamento. O desinstalador de Configuracoes > Aplicativos faz o mesmo que a opcao
; Desinstalar. O atalho "Atualizar Pulyn" (area de trabalho e menu Iniciar) roda C:\Pulyn\scripts\atualizar-github.ps1.

#ifndef Versao
  #define Versao "0.0.0"
#endif
#ifndef Montagem
  #define Montagem "montagem"
#endif

[Setup]
AppId={{8F3C2B1A-6D4E-4B7F-9A21-5C3E7D9B0F42}
AppName=Pulyn
AppVersion={#Versao}
AppVerName=Pulyn {#Versao}
AppPublisher=Pulyn
DefaultDirName=C:\Pulyn\pacote
DisableDirPage=yes
DisableProgramGroupPage=yes
DefaultGroupName=Pulyn
SetupIconFile=imagens\pulyn.ico
UninstallDisplayIcon={app}\pulyn.ico
#ifdef Previa
; Previa (ISCC /DPrevia): so para ver as telas; nao pede administrador e nao executa nada
PrivilegesRequired=lowest
#else
PrivilegesRequired=admin
#endif
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
; Na opcao Desinstalar nao ha nada a registrar.
Uninstallable=not EhDesinstalacao
UninstallDisplayName=Pulyn
OutputBaseFilename=Pulyn-Setup-{#Versao}
Compression=lzma2/max
SolidCompression=yes
SetupLogging=yes
ShowLanguageDialog=no
; Visual do Pulyn: fundo escuro (#0D1B2A), mascote e logo
WizardStyle=modern dark hidebevels
WizardBackColor=#0D1B2A
WizardImageFile=imagens\lateral.png,imagens\lateral-150.png
WizardSmallImageFile=imagens\canto.png,imagens\canto-150.png

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
SetupWindowTitle=Pulyn - instalação e manutenção
WelcomeLabel1=Bem-vindo ao Pulyn
WelcomeLabel2=Este assistente instala, atualiza ou remove o Pulyn deste computador: banco de dados, servidor e as telas do sistema, prontos para a rede do buffet.%n%nPara instalar: deixe o computador ligado no roteador por cabo e com o IP fixo (reserva no roteador). O Windows precisa ser Pro, Enterprise ou Server.
FinishedHeadingLabel=Pulyn
ButtonInstall=&Começar

[Files]
Source: "{#Montagem}\pacote\*"; Excludes: "\terceiros\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion; Check: CopiarPacote
Source: "imagens\pulyn.ico"; DestDir: "{app}"; Flags: ignoreversion; Check: not EhDesinstalacao
; Instaladores do Node.js, PostgreSQL, URL Rewrite, ARR e WinSW (~380 MB): so na primeira instalacao. Ficam num bloco
; comprimido separado (solidbreak) para a atualizacao nem precisar descompacta-los.
Source: "{#Montagem}\pacote\terceiros\*"; DestDir: "{app}\terceiros"; Flags: ignoreversion solidbreak; Check: EhPrimeiraInstalacao
; Usados pelas opcoes Desinstalar e Atualizar pela internet (extraidos para a pasta temporaria do setup)
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\desinstalar.ps1"; Flags: dontcopy solidbreak
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\atualizar-github.ps1"; Flags: dontcopy
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\config.ps1"; Flags: dontcopy
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\backup-banco.ps1"; Flags: dontcopy
; Git portatil (MinGit) para a atualizacao pela internet
Source: "{#Montagem}\extras\MinGit.zip"; Flags: dontcopy solidbreak

[Icons]
Name: "{commondesktop}\Atualizar Pulyn"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""C:\Pulyn\scripts\atualizar-github.ps1"""; IconFilename: "{app}\pulyn.ico"; Comment: "Baixa do GitHub a versão nova do Pulyn e publica"; Check: not EhDesinstalacao
Name: "{group}\Atualizar Pulyn"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""C:\Pulyn\scripts\atualizar-github.ps1"""; IconFilename: "{app}\pulyn.ico"; Comment: "Baixa do GitHub a versão nova do Pulyn e publica"; Check: not EhDesinstalacao

[Code]
const
  MODO_INSTALAR = 0;
  MODO_ATUALIZAR_GITHUB = 1;
  MODO_ATUALIZAR_PACOTE = 2;
  MODO_DESINSTALAR = 3;
  CHAVE_DESINSTALADOR = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{8F3C2B1A-6D4E-4B7F-9A21-5C3E7D9B0F42}_is1';

var
  PaginaModo: TInputOptionWizardPage;
  PaginaIp: TInputQueryWizardPage;
  PaginaPg: TInputQueryWizardPage;
  PaginaMaster: TInputQueryWizardPage;
  PaginaRemover: TInputOptionWizardPage;
  JaInstalado: Boolean;
  TemRestos: Boolean;
  PgInstalado: Boolean;
  VersaoInstalada: string;
  CodigoResultado: Integer;

function SetEnvironmentVariable(lpName: string; lpValue: string): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

function PowerShell: string;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

function Modo: Integer;
begin
  if PaginaModo = nil then
    Result := MODO_INSTALAR
  else
    Result := PaginaModo.SelectedValueIndex;
end;

function EhDesinstalacao: Boolean;
begin
  Result := Modo = MODO_DESINSTALAR;
end;

function EhPrimeiraInstalacao: Boolean;
begin
  Result := Modo = MODO_INSTALAR;
end;

// O pacote (sistema compilado) so e copiado na primeira instalacao e na atualizacao com este instalador.
function CopiarPacote: Boolean;
begin
  Result := (Modo = MODO_INSTALAR) or (Modo = MODO_ATUALIZAR_PACOTE);
end;

function EhAtualizacao: Boolean;
begin
  Result := (Modo = MODO_ATUALIZAR_GITHUB) or (Modo = MODO_ATUALIZAR_PACOTE);
end;

// IP da placa de rede que tem rota para a rede (o mesmo criterio dos scripts).
function DetectarIp: string;
var
  Codigo: Integer;
  Arquivo: string;
  Texto: AnsiString;
begin
  Result := '';
  Arquivo := ExpandConstant('{tmp}\ip.txt');
  if Exec(PowerShell,
    '-NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq ''Up'' } | Select-Object -First 1; if ($c) { [IO.File]::WriteAllText(''' + Arquivo + ''', $c.IPv4Address[0].IPAddress) }"',
    '', SW_HIDE, ewWaitUntilTerminated, Codigo) then
    if LoadStringFromFile(Arquivo, Texto) then
      Result := Trim(String(Texto));
end;

function LerVersaoInstalada: string;
var
  Linhas: TArrayOfString;
begin
  Result := '';
  if LoadStringsFromFile('C:\Pulyn\pacote\VERSAO.txt', Linhas) and (GetArrayLength(Linhas) > 0) then
    Result := Trim(Linhas[0]);
end;

function IpValido(Ip: string): Boolean;
var
  Partes, I, Numero, Inicio: Integer;
  Pedaco: string;
begin
  Result := False;
  Ip := Ip + '.';
  Partes := 0;
  Inicio := 1;
  for I := 1 to Length(Ip) do
  begin
    if Ip[I] = '.' then
    begin
      Pedaco := Copy(Ip, Inicio, I - Inicio);
      Numero := StrToIntDef(Pedaco, -1);
      if (Pedaco = '') or (Length(Pedaco) > 3) or (Numero < 0) or (Numero > 255) then Exit;
      Partes := Partes + 1;
      Inicio := I + 1;
    end
    else if (Ip[I] < '0') or (Ip[I] > '9') then Exit;
  end;
  Result := Partes = 4;
end;

function EmailValido(Email: string): Boolean;
var
  Arroba: Integer;
begin
  Arroba := Pos('@', Email);
  Result := (Arroba > 1) and (Pos('.', Copy(Email, Arroba + 1, Length(Email))) > 1) and (Pos(' ', Email) = 0)
    and (Pos('"', Email) = 0) and (Pos('''', Email) = 0);
end;

procedure InitializeWizard;
var
  Situacao: string;
begin
  JaInstalado := FileExists('C:\Pulyn\backend\.env');
  TemRestos := JaInstalado or DirExists('C:\Pulyn\backend') or DirExists('C:\Pulyn\site')
    or RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\PulynBackend');
  PgInstalado := FileExists(ExpandConstant('{commonpf64}\PostgreSQL\18\bin\psql.exe'));
  VersaoInstalada := LerVersaoInstalada;

  if JaInstalado then
  begin
    Situacao := 'Situação deste computador: o Pulyn está instalado';
    if VersaoInstalada <> '' then Situacao := Situacao + ' (' + VersaoInstalada + ')';
    Situacao := Situacao + '. Esta é a versão {#Versao}.';
  end
  else if TemRestos then
    Situacao := 'Situação deste computador: há restos de uma instalação do Pulyn que não terminou.'
  else
    Situacao := 'Situação deste computador: o Pulyn ainda não está instalado.';

  // ---- 1. o que fazer
  PaginaModo := CreateInputOptionPage(wpWelcome, 'O que você quer fazer?', Situacao,
    'Escolha uma opção e clique em Avançar.', True, False);
  PaginaModo.Add('Primeira instalação' + #13#10 + 'Instala o Pulyn completo: banco de dados novo, servidor, telas e certificado HTTPS.');
  PaginaModo.Add('Atualizar pela internet (GitHub)' + #13#10 + 'Como o comando atualizar: baixa do GitHub só o que mudou, faz backup do banco e publica. Dados, senhas e certificado continuam os mesmos.');
  PaginaModo.Add('Atualizar com este instalador (sem internet)' + #13#10 + 'Publica a versão {#Versao} que veio dentro deste arquivo, com backup do banco antes.');
  PaginaModo.Add('Desinstalar' + #13#10 + 'Remove o Pulyn deste computador. O banco de dados só é apagado se você escolher.');
  PaginaModo.CheckListBox.ItemEnabled[MODO_INSTALAR] := not JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_ATUALIZAR_GITHUB] := JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_ATUALIZAR_PACOTE] := JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_DESINSTALAR] := TemRestos;
  if JaInstalado then
    PaginaModo.SelectedValueIndex := MODO_ATUALIZAR_GITHUB
  else
    PaginaModo.SelectedValueIndex := MODO_INSTALAR;

  // ---- 2. primeira instalacao
  PaginaIp := CreateInputQueryPage(PaginaModo.ID, 'Rede do buffet',
    'Qual é o IP fixo deste computador?',
    'Tablets, celulares e placas vão acessar o sistema por este endereço (https://IP). Ele precisa estar reservado no roteador para não mudar.');
  PaginaIp.Add('IP do servidor:', False);
  PaginaIp.Values[0] := DetectarIp;

  if PgInstalado then
    PaginaPg := CreateInputQueryPage(PaginaIp.ID, 'Banco de dados',
      'Senha do PostgreSQL',
      'O PostgreSQL já está instalado neste computador. Digite a senha do usuário "postgres" que foi definida na instalação dele.')
  else
    PaginaPg := CreateInputQueryPage(PaginaIp.ID, 'Banco de dados',
      'Crie a senha do PostgreSQL',
      'O PostgreSQL será instalado agora. Escolha a senha do usuário administrador "postgres" e guarde-a em local seguro: ela é pedida em manutenções.');
  PaginaPg.Add('Senha do postgres:', True);
  if not PgInstalado then
    PaginaPg.Add('Repita a senha:', True);

  PaginaMaster := CreateInputQueryPage(PaginaPg.ID, 'Usuário master',
    'Acesso de administrador geral do Pulyn',
    'Com este usuário você entra no sistema, cadastra o buffet em Master > Clientes e cria o administrador do buffet.');
  PaginaMaster.Add('E-mail do master:', False);
  PaginaMaster.Add('Senha (mínimo 6 caracteres):', True);
  PaginaMaster.Add('Repita a senha:', True);

  // ---- 3. desinstalar
  PaginaRemover := CreateInputOptionPage(PaginaMaster.ID, 'Desinstalar o Pulyn',
    'O que será removido deste computador',
    'Serão removidos: o serviço PulynBackend, o site Pulyn no IIS, os certificados do Pulyn, as regras de firewall, o backup automático e os arquivos em C:\Pulyn.' + #13#10#13#10 +
    'Continuam instalados: Node.js, PostgreSQL e o IIS (podem servir a outros sites), e a pasta C:\Pulyn\backups.' + #13#10#13#10 +
    'Se o banco ficar, instalar o Pulyn de novo traz o sistema de volta com os mesmos dados.',
    False, False);
  PaginaRemover.Add('Apagar também o banco de dados (crianças, eventos, pulseiras, pontuação). Um backup é feito antes, em C:\Pulyn\backups.');
  PaginaRemover.Values[0] := False;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if (PageID = PaginaIp.ID) or (PageID = PaginaPg.ID) or (PageID = PaginaMaster.ID) then
    Result := Modo <> MODO_INSTALAR
  else if PageID = PaginaRemover.ID then
    Result := Modo <> MODO_DESINSTALAR;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PaginaModo.ID then
  begin
    if not PaginaModo.CheckListBox.ItemEnabled[Modo] then
    begin
      MsgBox('Essa opção não está disponível neste computador.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaIp.ID then
  begin
    PaginaIp.Values[0] := Trim(PaginaIp.Values[0]);
    if not IpValido(PaginaIp.Values[0]) then
    begin
      MsgBox('Digite um IP no formato 192.168.1.60.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaPg.ID then
  begin
    if Length(PaginaPg.Values[0]) < 6 then
    begin
      MsgBox('A senha do postgres precisa ter pelo menos 6 caracteres.', mbError, MB_OK);
      Result := False;
    end
    else if (not PgInstalado) and (PaginaPg.Values[0] <> PaginaPg.Values[1]) then
    begin
      MsgBox('As senhas do postgres não conferem.', mbError, MB_OK);
      Result := False;
    end
    else if Pos('"', PaginaPg.Values[0]) > 0 then
    begin
      MsgBox('A senha do postgres não pode ter aspas (").', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaMaster.ID then
  begin
    PaginaMaster.Values[0] := Trim(PaginaMaster.Values[0]);
    if not EmailValido(PaginaMaster.Values[0]) then
    begin
      MsgBox('Digite um e-mail válido para o master.', mbError, MB_OK);
      Result := False;
    end
    else if Length(PaginaMaster.Values[1]) < 6 then
    begin
      MsgBox('A senha do master precisa ter pelo menos 6 caracteres.', mbError, MB_OK);
      Result := False;
    end
    else if PaginaMaster.Values[1] <> PaginaMaster.Values[2] then
    begin
      MsgBox('As senhas do master não conferem.', mbError, MB_OK);
      Result := False;
    end;
  end
  else if CurPageID = PaginaRemover.ID then
  begin
    if PaginaRemover.Values[0] then
      Result := MsgBox('O banco de dados do Pulyn será APAGADO (com backup antes em C:\Pulyn\backups). Confirma?',
        mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpReady then
  begin
    if Modo = MODO_DESINSTALAR then
      WizardForm.NextButton.Caption := '&Desinstalar'
    else if EhAtualizacao then
      WizardForm.NextButton.Caption := '&Atualizar'
    else
      WizardForm.NextButton.Caption := '&Instalar';
  end
  else if CurPageID = wpFinished then
  begin
    if CodigoResultado <> 0 then
      WizardForm.FinishedLabel.Caption :=
        'A operação NÃO terminou.' + #13#10#13#10 +
        'O motivo aparece na janela do PowerShell e no registro (C:\Pulyn\logs\instalacao-*.log ou %TEMP%\pulyn-desinstalacao-*.log).' + #13#10#13#10 +
        'Corrija o problema e rode este instalador de novo: o que já foi feito é reaproveitado.'
    else if Modo = MODO_DESINSTALAR then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn foi removido deste computador.' + #13#10#13#10 +
        'Os backups continuam em C:\Pulyn\backups.'
    else if Modo = MODO_ATUALIZAR_GITHUB then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn está com a versão mais nova do GitHub.' + #13#10#13#10 +
        'Da próxima vez, basta usar o atalho "Atualizar Pulyn" da área de trabalho.' + #13#10 +
        'Os tablets e as placas continuam funcionando sem mudar nada.'
    else if Modo = MODO_ATUALIZAR_PACOTE then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn foi atualizado para a versão {#Versao}.' + #13#10#13#10 +
        'Os tablets e as placas continuam funcionando sem mudar nada.'
    else
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn está no ar em https://' + PaginaIp.Values[0] + #13#10#13#10 +
        'Próximos passos:' + #13#10 +
        '1. Instale o certificado C:\Pulyn\certs\PulynCA.cer em cada tablet e celular.' + #13#10 +
        '2. Entre com o usuário master e cadastre o buffet em Master > Clientes.' + #13#10 +
        '3. Configure as placas pelo portal delas, com o servidor https://' + PaginaIp.Values[0];
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  if Modo = MODO_DESINSTALAR then
  begin
    Result := 'DESINSTALAR o Pulyn deste computador' + NewLine + NewLine;
    if PaginaRemover.Values[0] then
      Result := Result + 'Banco de dados: será APAGADO (backup antes em C:\Pulyn\backups)'
    else
      Result := Result + 'Banco de dados: continua no PostgreSQL';
  end
  else if Modo = MODO_ATUALIZAR_GITHUB then
  begin
    Result := 'ATUALIZAR o Pulyn pela internet (GitHub, branch main)';
    if VersaoInstalada <> '' then Result := Result + NewLine + NewLine + 'Instalada: ' + VersaoInstalada;
    Result := Result + NewLine + NewLine +
      'O que acontece:' + NewLine +
      '- baixa do GitHub só o que mudou (na primeira vez, o código todo);' + NewLine +
      '- se não houver nada novo, para e avisa;' + NewLine +
      '- backup do banco, compilação das telas e publicação.' + NewLine + NewLine +
      'Precisa de internet. Dados, senhas e certificado continuam os mesmos.';
  end
  else if Modo = MODO_ATUALIZAR_PACOTE then
  begin
    Result := 'ATUALIZAR o Pulyn com este instalador (sem internet)';
    if VersaoInstalada <> '' then Result := Result + NewLine + NewLine + 'Instalada: ' + VersaoInstalada;
    Result := Result + NewLine + 'Nova: Pulyn {#Versao}' + NewLine + NewLine +
      'O que acontece:' + NewLine +
      '- backup do banco;' + NewLine +
      '- publicação da versão nova do sistema (servidor e telas).' + NewLine + NewLine +
      'Não são reinstalados: Node.js, PostgreSQL, IIS. Dados, senhas e certificado continuam os mesmos.';
  end
  else
    Result := 'PRIMEIRA INSTALAÇÃO do Pulyn {#Versao}' + NewLine + NewLine +
      'Endereço do sistema: https://' + PaginaIp.Values[0] + NewLine +
      'Usuário master: ' + PaginaMaster.Values[0] + NewLine + NewLine +
      'Uma janela do PowerShell vai mostrar cada etapa. Pode levar de 5 a 20 minutos.';
end;

procedure Desinstalar;
var
  Parametros, Desinstalador: string;
  Codigo: Integer;
begin
  WizardForm.StatusLabel.Caption := 'Removendo o Pulyn (acompanhe na janela do PowerShell)...';
  ExtractTemporaryFile('config.ps1');
  ExtractTemporaryFile('backup-banco.ps1');
  ExtractTemporaryFile('desinstalar.ps1');
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\desinstalar.ps1') + '" -Sim';
  if PaginaRemover.Values[0] then
    Parametros := Parametros + ' -ApagarBanco';
  if not Exec(PowerShell, Parametros, '', SW_SHOW, ewWaitUntilTerminated, CodigoResultado) then
    CodigoResultado := -1;
  // Tira o pacote e o registro em Aplicativos, se o Pulyn foi instalado por um setup (o desinstalador silencioso nao
  // roda o desinstalar.ps1 de novo).
  if RegQueryStringValue(HKLM, CHAVE_DESINSTALADOR, 'UninstallString', Desinstalador) then
    Exec(RemoveQuotes(Desinstalador), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  if DirExists('C:\Pulyn\pacote') then
    DelTree('C:\Pulyn\pacote', True, True, True);
end;

procedure AtualizarPeloGithub;
var
  Parametros: string;
begin
  WizardForm.StatusLabel.Caption := 'Atualizando o Pulyn pelo GitHub (acompanhe na janela do PowerShell)...';
  ExtractTemporaryFile('config.ps1');
  ExtractTemporaryFile('backup-banco.ps1');
  ExtractTemporaryFile('atualizar-github.ps1');
  ExtractTemporaryFile('MinGit.zip');
  // O atalho "Atualizar Pulyn" usa C:\Pulyn\scripts; instalacoes antigas podem nao ter este script ainda.
  if DirExists('C:\Pulyn\scripts') and not FileExists('C:\Pulyn\scripts\atualizar-github.ps1') then
    FileCopy(ExpandConstant('{tmp}\atualizar-github.ps1'), 'C:\Pulyn\scripts\atualizar-github.ps1', True);
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\atualizar-github.ps1') + '"' +
    ' -MinGitZip "' + ExpandConstant('{tmp}\MinGit.zip') + '"';
  if not Exec(PowerShell, Parametros, '', SW_SHOW, ewWaitUntilTerminated, CodigoResultado) then
    CodigoResultado := -1;
end;

procedure InstalarOuAtualizar;
var
  Parametros: string;
begin
  if Modo = MODO_ATUALIZAR_PACOTE then
    WizardForm.StatusLabel.Caption := 'Atualizando o Pulyn (acompanhe na janela do PowerShell)...'
  else
    WizardForm.StatusLabel.Caption := 'Configurando o Pulyn (acompanhe na janela do PowerShell)...';
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\BackEnd\deploy\iis\instalar-tudo.ps1') + '"' +
    ' -Terceiros "' + ExpandConstant('{app}\terceiros') + '"' +
    ' -SiteBuild "' + ExpandConstant('{app}\site-build') + '"';
  ExtractTemporaryFile('MinGit.zip');
  Parametros := Parametros + ' -MinGitZip "' + ExpandConstant('{tmp}\MinGit.zip') + '"';
  if Modo = MODO_INSTALAR then
  begin
    // As senhas vao por variavel de ambiente (herdada pelo PowerShell), nunca pela linha de comando.
    SetEnvironmentVariable('PULYN_PG_ADMIN_SENHA', PaginaPg.Values[0]);
    SetEnvironmentVariable('PULYN_MASTER_SENHA', PaginaMaster.Values[1]);
    Parametros := Parametros + ' -Modo Instalar -Ip ' + PaginaIp.Values[0] + ' -EmailMaster "' + PaginaMaster.Values[0] + '"';
  end
  else
    Parametros := Parametros + ' -Modo Atualizar';
  if not Exec(PowerShell, Parametros, '', SW_SHOW, ewWaitUntilTerminated, CodigoResultado) then
    CodigoResultado := -1;
  SetEnvironmentVariable('PULYN_PG_ADMIN_SENHA', '');
  SetEnvironmentVariable('PULYN_MASTER_SENHA', '');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssPostInstall then Exit;
#ifdef Previa
  Exit;
#endif
  if Modo = MODO_DESINSTALAR then
    Desinstalar
  else if Modo = MODO_ATUALIZAR_GITHUB then
    AtualizarPeloGithub
  else
    InstalarOuAtualizar;
end;

// ---------------------------------------------------------------- desinstalador (Configuracoes > Aplicativos)
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Parametros: string;
  Codigo: Integer;
  ApagarBanco: Boolean;
begin
  if CurUninstallStep <> usUninstall then Exit;
  // Silencioso = chamado pela opcao Desinstalar do setup, que ja removeu tudo; aqui so sai o pacote e o registro.
  if UninstallSilent then Exit;
  ApagarBanco := MsgBox('Apagar também o BANCO DE DADOS do Pulyn (crianças, eventos, pulseiras, pontuação)?' + #13#10#13#10 +
    'Sim: antes é feito um backup em C:\Pulyn\backups e depois o banco é apagado.' + #13#10 +
    'Não: o banco fica no PostgreSQL. Instalando o Pulyn de novo, o sistema volta com os mesmos dados.',
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\BackEnd\deploy\iis\desinstalar.ps1') + '" -Sim';
  if ApagarBanco then
    Parametros := Parametros + ' -ApagarBanco';
  if (not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Parametros, '', SW_SHOW, ewWaitUntilTerminated, Codigo)) or (Codigo <> 0) then
    MsgBox('A remoção do Pulyn terminou com avisos. Veja a janela do PowerShell ou o registro pulyn-desinstalacao-*.log na pasta temporária do Windows (%TEMP%).',
      mbInformation, MB_OK);
end;
