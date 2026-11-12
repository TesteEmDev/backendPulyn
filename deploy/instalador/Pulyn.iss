; Pulyn.iss - instalador (setup.exe) do Pulyn para o servidor Windows/IIS de um buffet.
; Nao compile direto: use gerar-instalador.ps1, que monta a pasta "montagem" (sistema compilado + instaladores) e chama o ISCC.
;
; O setup copia o pacote para C:\Pulyn\pacote, pergunta o IP, a senha do postgres e o usuario master e roda
; BackEnd\deploy\iis\instalar-tudo.ps1 (uma janela do PowerShell mostra o andamento). Se o Pulyn ja estiver instalado,
; nao pergunta senhas: so atualiza o sistema (com backup do banco antes).

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
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
; Desinstalar so o pacote deixaria o IIS, o servico e o banco pela metade: a remocao e manual (README do instalador).
Uninstallable=no
OutputBaseFilename=Pulyn-Setup-{#Versao}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
ShowLanguageDialog=no

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
WelcomeLabel2=Este assistente instala o Pulyn neste computador: banco de dados, servidor e as telas do sistema, prontos para a rede do buffet.%n%nAntes de continuar: deixe o computador ligado no roteador por cabo e com o IP fixo (reserva no roteador). O Windows precisa ser Pro, Enterprise ou Server.
FinishedHeadingLabel=Instalação do Pulyn

[Files]
Source: "{#Montagem}\pacote\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Code]
var
  PaginaIp: TInputQueryWizardPage;
  PaginaPg: TInputQueryWizardPage;
  PaginaMaster: TInputQueryWizardPage;
  JaInstalado: Boolean;
  PgInstalado: Boolean;
  CodigoInstalacao: Integer;

function SetEnvironmentVariable(lpName: string; lpValue: string): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

// IP da placa de rede que tem rota para a rede (o mesmo criterio dos scripts).
function DetectarIp: string;
var
  Codigo: Integer;
  Arquivo: string;
  Texto: AnsiString;
begin
  Result := '';
  Arquivo := ExpandConstant('{tmp}\ip.txt');
  if Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq ''Up'' } | Select-Object -First 1; if ($c) { [IO.File]::WriteAllText(''' + Arquivo + ''', $c.IPv4Address[0].IPAddress) }"',
    '', SW_HIDE, ewWaitUntilTerminated, Codigo) then
    if LoadStringFromFile(Arquivo, Texto) then
      Result := Trim(String(Texto));
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
begin
  JaInstalado := FileExists('C:\Pulyn\backend\.env');
  PgInstalado := FileExists(ExpandConstant('{commonpf64}\PostgreSQL\18\bin\psql.exe'));

  PaginaIp := CreateInputQueryPage(wpWelcome, 'Rede do buffet',
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
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  // Atualizacao: o banco, o .env e o master ja existem.
  Result := JaInstalado and ((PageID = PaginaPg.ID) or (PageID = PaginaMaster.ID));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = PaginaIp.ID then
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
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  if JaInstalado then
    Result := 'O Pulyn já está instalado neste computador.' + NewLine + NewLine +
      'Será feita uma ATUALIZAÇÃO: backup do banco e publicação da versão {#Versao}.' + NewLine +
      'O banco de dados, as senhas e o certificado continuam os mesmos.'
  else
    Result := 'Instalação nova do Pulyn {#Versao}' + NewLine + NewLine +
      'Endereço do sistema: https://' + PaginaIp.Values[0] + NewLine +
      'Usuário master: ' + PaginaMaster.Values[0] + NewLine + NewLine +
      'Uma janela do PowerShell vai mostrar cada etapa. Pode levar de 5 a 20 minutos.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Parametros: string;
begin
  if CurStep <> ssPostInstall then Exit;
  WizardForm.StatusLabel.Caption := 'Configurando o Pulyn (acompanhe na janela do PowerShell)...';
  // As senhas vao por variavel de ambiente (herdada pelo PowerShell), nunca pela linha de comando.
  if not JaInstalado then
  begin
    SetEnvironmentVariable('PULYN_PG_ADMIN_SENHA', PaginaPg.Values[0]);
    SetEnvironmentVariable('PULYN_MASTER_SENHA', PaginaMaster.Values[1]);
  end;
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\BackEnd\deploy\iis\instalar-tudo.ps1') + '"' +
    ' -Ip ' + PaginaIp.Values[0] +
    ' -Terceiros "' + ExpandConstant('{app}\terceiros') + '"' +
    ' -SiteBuild "' + ExpandConstant('{app}\site-build') + '"';
  if not JaInstalado then
    Parametros := Parametros + ' -EmailMaster "' + PaginaMaster.Values[0] + '"';
  if not Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Parametros, '', SW_SHOW, ewWaitUntilTerminated, CodigoInstalacao) then
    CodigoInstalacao := -1;
  SetEnvironmentVariable('PULYN_PG_ADMIN_SENHA', '');
  SetEnvironmentVariable('PULYN_MASTER_SENHA', '');
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID <> wpFinished then Exit;
  if CodigoInstalacao = 0 then
    WizardForm.FinishedLabel.Caption :=
      'O Pulyn está no ar em https://' + PaginaIp.Values[0] + #13#10#13#10 +
      'Próximos passos:' + #13#10 +
      '1. Instale o certificado C:\Pulyn\certs\PulynCA.cer em cada tablet e celular.' + #13#10 +
      '2. Entre com o usuário master e cadastre o buffet em Master > Clientes.' + #13#10 +
      '3. Configure as placas pelo portal delas, com o servidor https://' + PaginaIp.Values[0]
  else
    WizardForm.FinishedLabel.Caption :=
      'A configuração do Pulyn NÃO terminou.' + #13#10#13#10 +
      'O motivo aparece na janela do PowerShell e no registro em C:\Pulyn\logs (arquivo instalacao-*.log).' + #13#10#13#10 +
      'Corrija o problema e rode este instalador de novo: o que já foi feito é reaproveitado.';
end;
