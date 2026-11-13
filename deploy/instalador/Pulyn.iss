; Pulyn.iss - instalador (setup.exe) do Pulyn para o servidor Windows/IIS de um buffet.
; Nao compile direto: use gerar-instalador.ps1, que monta a pasta "montagem" (sistema compilado + instaladores) e chama o ISCC.
;
; A segunda tela pergunta o que fazer:
;   Primeira instalacao: pede IP, senha do postgres e usuario master; copia o pacote para C:\Pulyn\pacote e roda
;                        BackEnd\deploy\iis\instalar-tudo.ps1 -Modo Instalar
;   Atualizar:           roda atualizar-github.ps1 (git pull da main do GitHub, so o que mudou, backup e publicacao).
;                        O pacote deste arquivo NAO e usado na atualizacao: ela sempre traz a versao da internet.
;   Desinstalar:         roda desinstalar.ps1 (o banco so e apagado se a pessoa marcar, com backup antes)
; Os scripts rodam escondidos (sem janela do PowerShell): o andamento aparece na propria tela do setup (etapa, barra de
; progresso e detalhes), a partir das linhas "[n/total] etapa" e "ERRO: ..." que eles escrevem. O desinstalador de
; Configuracoes > Aplicativos faz o mesmo que a opcao Desinstalar. O atalho "Atualizar Pulyn" (area de trabalho e menu Iniciar) roda C:\Pulyn\scripts\atualizar-github.ps1.

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
Source: "{#Montagem}\pacote\*"; Excludes: "\terceiros\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion; Check: EhPrimeiraInstalacao
Source: "imagens\pulyn.ico"; DestDir: "{app}"; Flags: ignoreversion; Check: not EhDesinstalacao
; Instaladores do Node.js, PostgreSQL, URL Rewrite, ARR e WinSW (~380 MB): so na primeira instalacao. Ficam num bloco
; comprimido separado (solidbreak) para a atualizacao nem precisar descompacta-los.
Source: "{#Montagem}\pacote\terceiros\*"; DestDir: "{app}\terceiros"; Flags: ignoreversion solidbreak; Check: EhPrimeiraInstalacao
; Usados pelas opcoes Desinstalar e Atualizar (extraidos para a pasta temporaria do setup)
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\desinstalar.ps1"; Flags: dontcopy solidbreak
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\atualizar-github.ps1"; Flags: dontcopy
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\config.ps1"; Flags: dontcopy
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\backup-banco.ps1"; Flags: dontcopy
; Git portatil (MinGit) para a atualizacao
Source: "{#Montagem}\extras\MinGit.zip"; Flags: dontcopy solidbreak

[Icons]
Name: "{commondesktop}\Atualizar Pulyn"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""C:\Pulyn\scripts\atualizar-github.ps1"""; IconFilename: "{app}\pulyn.ico"; Comment: "Baixa a versão nova do Pulyn e publica"; Check: not EhDesinstalacao
Name: "{group}\Atualizar Pulyn"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""C:\Pulyn\scripts\atualizar-github.ps1"""; IconFilename: "{app}\pulyn.ico"; Comment: "Baixa a versão nova do Pulyn e publica"; Check: not EhDesinstalacao

[Code]
const
  MODO_INSTALAR = 0;
  MODO_ATUALIZAR = 1;
  MODO_DESINSTALAR = 2;
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
  // Banco AdvPulyn que sobrou de uma instalacao que parou no meio: a pessoa confirmou que ele pode ser recriado.
  RecriarBanco: Boolean;
  // Andamento dos scripts (lido da saida deles)
  MemoDetalhes: TNewMemo;
  UltimoErro: string;
  UltimoAviso: string;
  ArquivoRegistro: string;
  SemMudancas: Boolean;

function SetEnvironmentVariable(lpName: string; lpValue: string): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

function PowerShell: string;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

// ---------------------------------------------------------------- andamento dos scripts
// Os scripts sao ASCII (sem acentos); aqui os titulos das etapas ganham o texto da tela.
function TituloPasso(Texto: string): string;
begin
  Result := Texto;
  // instalar-tudo.ps1
  if Texto = 'Conferindo o Node.js e o PostgreSQL (ja instalados)' then Result := 'Conferindo o Node.js e o PostgreSQL'
  else if Texto = 'Node.js e PostgreSQL' then Result := 'Instalando o Node.js e o PostgreSQL'
  else if Texto = 'Backup do banco antes de atualizar (os dados nao sao alterados)' then Result := 'Fazendo o backup do banco de dados'
  else if Texto = 'Certificado HTTPS (o atual continua valendo)' then Result := 'Conferindo o certificado HTTPS'
  else if Texto = 'Certificado HTTPS' then Result := 'Gerando o certificado HTTPS'
  else if Texto = 'Publicando a versao nova' then Result := 'Publicando a versão nova'
  else if Texto = 'Backup diario e atualizacao pela internet' then Result := 'Configurando o backup diário e a atualização'
  // atualizar-github.ps1
  else if Texto = 'Buscando a versao nova' then Result := 'Buscando a versão nova'
  else if Texto = 'Dependencias das telas' then Result := 'Preparando as telas'
  else if Texto = 'Backup do banco e publicacao' then Result := 'Backup do banco, compilação das telas e publicação'
  // desinstalar.ps1
  else if Texto = 'Parando o servico PulynBackend' then Result := 'Parando o serviço PulynBackend'
  else if Texto = 'Banco de dados: backup e remocao' then Result := 'Fazendo o backup e apagando o banco de dados'
  else if Texto = 'Removendo o servico' then Result := 'Removendo o serviço';
end;

// Linha "[n/total] titulo" = comeco de uma etapa.
function LerPasso(Linha: string; var N, Total: Integer; var Titulo: string): Boolean;
var
  Fecha, Barra: Integer;
begin
  Result := False;
  if (Length(Linha) < 6) or (Linha[1] <> '[') then Exit;
  Fecha := Pos('] ', Linha);
  Barra := Pos('/', Linha);
  if (Fecha = 0) or (Barra < 3) or (Barra > Fecha) then Exit;
  N := StrToIntDef(Copy(Linha, 2, Barra - 2), 0);
  Total := StrToIntDef(Copy(Linha, Barra + 1, Fecha - Barra - 1), 0);
  if (N < 1) or (Total < N) then Exit;
  Titulo := TituloPasso(Trim(Copy(Linha, Fecha + 2, Length(Linha))));
  Result := True;
end;

// Erros, avisos e o arquivo de registro que o script informou.
procedure GuardarInformacoes(Linha: string);
begin
  if Copy(Linha, 1, 6) = 'ERRO: ' then
    UltimoErro := Trim(Copy(Linha, 7, Length(Linha)))
  else if Copy(Linha, 1, 9) = 'atencao: ' then
    UltimoAviso := Trim(Copy(Linha, 10, Length(Linha)))
  else if (Copy(Linha, 1, 9) = 'Registro:') or (Copy(Linha, 1, 26) = 'Registro desta instalacao:') then
    ArquivoRegistro := Trim(Copy(Linha, Pos(':', Linha) + 1, Length(Linha)))
  else if Pos('ja esta na versao mais nova', Linha) > 0 then
    SemMudancas := True;
end;

// Chamado a cada linha que o PowerShell escreve, enquanto ele roda.
procedure AoReceberLinha(const S: String; const Error, FirstLine: Boolean);
var
  Linha, Titulo: string;
  N, Total: Integer;
begin
  Linha := Trim(S);
  if Linha = '' then Exit;
  Log('PowerShell: ' + Linha);
  MemoDetalhes.Lines.Add(TrimRight(S));
  SendMessage(MemoDetalhes.Handle, $0115 { WM_VSCROLL }, 7 { SB_BOTTOM }, 0);
  if LerPasso(Linha, N, Total, Titulo) then
  begin
    WizardForm.StatusLabel.Caption := Titulo + ' (etapa ' + IntToStr(N) + ' de ' + IntToStr(Total) + ')';
    WizardForm.FilenameLabel.Caption := '';
    WizardForm.ProgressGauge.Style := npbstNormal;
    WizardForm.ProgressGauge.Min := 0;
    WizardForm.ProgressGauge.Max := Total;
    WizardForm.ProgressGauge.Position := N - 1;
    Exit;
  end;
  GuardarInformacoes(Linha);
  if Length(Linha) > 110 then Linha := Copy(Linha, 1, 107) + '...';
  WizardForm.FilenameLabel.Caption := Linha;
end;

// Roda um script do Pulyn sem janela; o andamento aparece na tela do setup.
procedure RodarPowerShell(Parametros, Status: string);
begin
  UltimoErro := '';
  UltimoAviso := '';
  ArquivoRegistro := '';
  SemMudancas := False;
  WizardForm.StatusLabel.Caption := Status;
  WizardForm.FilenameLabel.Caption := '';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  MemoDetalhes.Lines.Clear;
  MemoDetalhes.Visible := True;
  try
    // -NonInteractive: se algum script tentar perguntar algo, ele para com erro em vez de esperar para sempre.
    if not ExecAndLogOutput(PowerShell, '-NoProfile -NonInteractive -ExecutionPolicy Bypass ' + Parametros, '',
      SW_HIDE, ewWaitUntilTerminated, CodigoResultado, @AoReceberLinha) then
    begin
      UltimoErro := 'Não consegui iniciar o PowerShell (' + SysErrorMessage(CodigoResultado) + ').';
      CodigoResultado := -1;
    end;
  except
    UltimoErro := GetExceptionMessage;
    CodigoResultado := -1;
  end;
  WizardForm.ProgressGauge.Style := npbstNormal;
  if CodigoResultado = 0 then
    WizardForm.ProgressGauge.Position := WizardForm.ProgressGauge.Max;
end;

// Senha do postgres certa? E o banco AdvPulyn ja existe? (so quando o PostgreSQL ja esta instalado)
function ConferirPostgres(Senha: string; var BancoExiste: Boolean): Boolean;
var
  Arquivo: string;
  Codigo: Integer;
  Texto: AnsiString;
begin
  Arquivo := ExpandConstant('{tmp}\pg-banco.txt');
  DeleteFile(Arquivo);
  SetEnvironmentVariable('PGPASSWORD', Senha);
  Result := Exec(ExpandConstant('{commonpf64}\PostgreSQL\18\bin\psql.exe'),
    '-h localhost -p 5432 -U postgres -d postgres -w -At -o "' + Arquivo + '" -c "select 1 from pg_database where datname = ''AdvPulyn''"',
    '', SW_HIDE, ewWaitUntilTerminated, Codigo) and (Codigo = 0);
  SetEnvironmentVariable('PGPASSWORD', '');
  BancoExiste := False;
  if Result and LoadStringFromFile(Arquivo, Texto) then
    BancoExiste := Trim(String(Texto)) = '1';
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
    Situacao := Situacao + '.';
  end
  else if TemRestos then
    Situacao := 'Situação deste computador: há restos de uma instalação do Pulyn que não terminou.'
  else
    Situacao := 'Situação deste computador: o Pulyn ainda não está instalado.';

  // ---- 1. o que fazer
  PaginaModo := CreateInputOptionPage(wpWelcome, 'O que você quer fazer?', Situacao,
    'Escolha uma opção e clique em Avançar.', True, False);
  PaginaModo.Add('Primeira instalação' + #13#10 + 'Instala o Pulyn completo: banco de dados novo, servidor, telas e certificado HTTPS.');
  PaginaModo.Add('Atualizar' + #13#10 + 'Baixa a versão mais nova do Pulyn (só o que mudou), faz backup do banco e publica. Dados, senhas e certificado continuam os mesmos.');
  PaginaModo.Add('Desinstalar' + #13#10 + 'Remove o Pulyn deste computador. O banco de dados só é apagado se você escolher.');
  PaginaModo.CheckListBox.ItemEnabled[MODO_INSTALAR] := not JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_ATUALIZAR] := JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_DESINSTALAR] := TemRestos;
  if JaInstalado then
    PaginaModo.SelectedValueIndex := MODO_ATUALIZAR
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

  // ---- detalhes do andamento (abaixo da barra de progresso)
  MemoDetalhes := TNewMemo.Create(WizardForm);
  MemoDetalhes.Parent := WizardForm.InstallingPage;
  MemoDetalhes.Left := WizardForm.ProgressGauge.Left;
  MemoDetalhes.Width := WizardForm.ProgressGauge.Width;
  MemoDetalhes.Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + ScaleY(16);
  MemoDetalhes.Height := WizardForm.InstallingPage.Height - MemoDetalhes.Top;
  MemoDetalhes.Anchors := [akLeft, akTop, akRight, akBottom];
  MemoDetalhes.ReadOnly := True;
  MemoDetalhes.ScrollBars := ssVertical;
  MemoDetalhes.Font.Name := 'Consolas';
  MemoDetalhes.Font.Size := 8;
  MemoDetalhes.Visible := False;
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
var
  BancoExiste: Boolean;
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
    end
    else if PgInstalado then
    begin
      // Confere agora, antes de comecar: senha errada e o erro mais comum.
      RecriarBanco := False;
      if not ConferirPostgres(PaginaPg.Values[0], BancoExiste) then
      begin
        MsgBox('Não consegui entrar no PostgreSQL com essa senha.' + #13#10#13#10 +
          'Confira a senha do usuário "postgres" e se o serviço do PostgreSQL está rodando.', mbError, MB_OK);
        Result := False;
      end
      else if BancoExiste then
      begin
        RecriarBanco := MsgBox('Já existe um banco de dados AdvPulyn neste computador, de uma instalação do Pulyn que não terminou.' + #13#10#13#10 +
          'Para continuar, ele será APAGADO e criado de novo, vazio. Antes é feito um backup em C:\Pulyn\backups.' + #13#10#13#10 +
          'Continuar?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
        Result := RecriarBanco;
      end;
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
var
  Motivo: string;
begin
  if CurPageID = wpReady then
  begin
    if Modo = MODO_DESINSTALAR then
      WizardForm.NextButton.Caption := '&Desinstalar'
    else if Modo = MODO_ATUALIZAR then
      WizardForm.NextButton.Caption := '&Atualizar'
    else
      WizardForm.NextButton.Caption := '&Instalar';
  end
  else if CurPageID = wpFinished then
  begin
    if CodigoResultado <> 0 then
    begin
      Motivo := '';
      if UltimoErro <> '' then
        Motivo := 'Motivo: ' + UltimoErro + #13#10#13#10
      else if UltimoAviso <> '' then
        Motivo := 'Aviso: ' + UltimoAviso + #13#10#13#10;
      if ArquivoRegistro = '' then
        ArquivoRegistro := 'C:\Pulyn\logs';
      WizardForm.FinishedLabel.Caption :=
        'A operação NÃO terminou.' + #13#10#13#10 + Motivo +
        'Registro completo: ' + ArquivoRegistro + #13#10#13#10 +
        'Corrija o problema e rode este instalador de novo: o que já foi feito é reaproveitado.';
    end
    else if (Modo = MODO_ATUALIZAR) and SemMudancas then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn já estava na versão mais nova. Nada foi alterado.'
    else if Modo = MODO_DESINSTALAR then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn foi removido deste computador.' + #13#10#13#10 +
        'Os backups continuam em C:\Pulyn\backups.'
    else if Modo = MODO_ATUALIZAR then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn foi atualizado para a versão mais nova.' + #13#10#13#10 +
        'Da próxima vez, basta usar o atalho "Atualizar Pulyn" da área de trabalho.' + #13#10 +
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
  else if Modo = MODO_ATUALIZAR then
  begin
    Result := 'ATUALIZAR o Pulyn';
    if VersaoInstalada <> '' then Result := Result + NewLine + NewLine + 'Instalada: ' + VersaoInstalada;
    Result := Result + NewLine + NewLine +
      'O que acontece:' + NewLine +
      '- baixa só o que mudou (na primeira vez, o sistema todo);' + NewLine +
      '- se não houver nada novo, para e avisa;' + NewLine +
      '- backup do banco, preparação das telas e publicação.' + NewLine + NewLine +
      'Precisa de internet. Dados, senhas e certificado continuam os mesmos.';
  end
  else
  begin
    Result := 'PRIMEIRA INSTALAÇÃO do Pulyn {#Versao}' + NewLine + NewLine +
      'Endereço do sistema: https://' + PaginaIp.Values[0] + NewLine +
      'Usuário master: ' + PaginaMaster.Values[0];
    if RecriarBanco then
      Result := Result + NewLine + 'Banco de dados: o AdvPulyn que já existe será recriado vazio (backup antes)';
    Result := Result + NewLine + NewLine + 'O andamento aparece nesta janela. Pode levar de 5 a 20 minutos.';
  end;
end;

procedure Desinstalar;
var
  Parametros, Desinstalador: string;
  Codigo: Integer;
begin
  ExtractTemporaryFile('config.ps1');
  ExtractTemporaryFile('backup-banco.ps1');
  ExtractTemporaryFile('desinstalar.ps1');
  Parametros := '-File "' + ExpandConstant('{tmp}\desinstalar.ps1') + '" -Sim -SemPausa';
  if PaginaRemover.Values[0] then
    Parametros := Parametros + ' -ApagarBanco';
  RodarPowerShell(Parametros, 'Removendo o Pulyn...');
  // Tira o pacote e o registro em Aplicativos, se o Pulyn foi instalado por um setup (o desinstalador silencioso nao
  // roda o desinstalar.ps1 de novo).
  if RegQueryStringValue(HKLM, CHAVE_DESINSTALADOR, 'UninstallString', Desinstalador) then
    Exec(RemoveQuotes(Desinstalador), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  if DirExists('C:\Pulyn\pacote') then
    DelTree('C:\Pulyn\pacote', True, True, True);
end;

procedure Atualizar;
var
  Parametros: string;
begin
  ExtractTemporaryFile('config.ps1');
  ExtractTemporaryFile('backup-banco.ps1');
  ExtractTemporaryFile('atualizar-github.ps1');
  ExtractTemporaryFile('MinGit.zip');
  // O atalho "Atualizar Pulyn" usa C:\Pulyn\scripts; instalacoes antigas podem nao ter este script ainda.
  if DirExists('C:\Pulyn\scripts') and not FileExists('C:\Pulyn\scripts\atualizar-github.ps1') then
    FileCopy(ExpandConstant('{tmp}\atualizar-github.ps1'), 'C:\Pulyn\scripts\atualizar-github.ps1', True);
  Parametros := '-File "' + ExpandConstant('{tmp}\atualizar-github.ps1') + '"' +
    ' -MinGitZip "' + ExpandConstant('{tmp}\MinGit.zip') + '" -SemPausa';
  RodarPowerShell(Parametros, 'Atualizando o Pulyn...');
end;

procedure Instalar;
var
  Parametros: string;
begin
  Parametros := '-File "' + ExpandConstant('{app}\BackEnd\deploy\iis\instalar-tudo.ps1') + '" -SemPausa' +
    ' -Terceiros "' + ExpandConstant('{app}\terceiros') + '"' +
    ' -SiteBuild "' + ExpandConstant('{app}\site-build') + '"';
  ExtractTemporaryFile('MinGit.zip');
  Parametros := Parametros + ' -MinGitZip "' + ExpandConstant('{tmp}\MinGit.zip') + '"';
  // As senhas vao por variavel de ambiente (herdada pelo PowerShell), nunca pela linha de comando.
  SetEnvironmentVariable('PULYN_PG_ADMIN_SENHA', PaginaPg.Values[0]);
  SetEnvironmentVariable('PULYN_MASTER_SENHA', PaginaMaster.Values[1]);
  Parametros := Parametros + ' -Modo Instalar -Ip ' + PaginaIp.Values[0] + ' -EmailMaster "' + PaginaMaster.Values[0] + '"';
  if RecriarBanco then
    Parametros := Parametros + ' -RecriarBanco';
  RodarPowerShell(Parametros, 'Instalando o Pulyn...');
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
  else if Modo = MODO_ATUALIZAR then
    Atualizar
  else
    Instalar;
end;

// ---------------------------------------------------------------- desinstalador (Configuracoes > Aplicativos)
procedure AoReceberLinhaDesinstalacao(const S: String; const Error, FirstLine: Boolean);
var
  Linha, Titulo: string;
  N, Total: Integer;
begin
  Linha := Trim(S);
  if Linha = '' then Exit;
  Log('PowerShell: ' + Linha);
  if LerPasso(Linha, N, Total, Titulo) then
  begin
    UninstallProgressForm.StatusLabel.Caption := Titulo + ' (etapa ' + IntToStr(N) + ' de ' + IntToStr(Total) + ')';
    UninstallProgressForm.ProgressBar.Min := 0;
    UninstallProgressForm.ProgressBar.Max := Total;
    UninstallProgressForm.ProgressBar.Position := N - 1;
  end
  else
    GuardarInformacoes(Linha);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Parametros, Mensagem: string;
  Codigo: Integer;
  ApagarBanco, Rodou: Boolean;
begin
  if CurUninstallStep <> usUninstall then Exit;
  // Silencioso = chamado pela opcao Desinstalar do setup, que ja removeu tudo; aqui so sai o pacote e o registro.
  if UninstallSilent then Exit;
  ApagarBanco := MsgBox('Apagar também o BANCO DE DADOS do Pulyn (crianças, eventos, pulseiras, pontuação)?' + #13#10#13#10 +
    'Sim: antes é feito um backup em C:\Pulyn\backups e depois o banco é apagado.' + #13#10 +
    'Não: o banco fica no PostgreSQL. Instalando o Pulyn de novo, o sistema volta com os mesmos dados.',
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  Parametros := '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\BackEnd\deploy\iis\desinstalar.ps1') + '" -Sim -SemPausa';
  if ApagarBanco then
    Parametros := Parametros + ' -ApagarBanco';
  UltimoErro := '';
  UltimoAviso := '';
  ArquivoRegistro := '';
  UninstallProgressForm.StatusLabel.Caption := 'Removendo o Pulyn...';
  try
    Rodou := ExecAndLogOutput(PowerShell, Parametros, '', SW_HIDE, ewWaitUntilTerminated, Codigo, @AoReceberLinhaDesinstalacao);
  except
    Rodou := False;
    UltimoErro := GetExceptionMessage;
  end;
  if (not Rodou) or (Codigo <> 0) then
  begin
    Mensagem := 'A remoção do Pulyn terminou com avisos.';
    if UltimoErro <> '' then
      Mensagem := Mensagem + #13#10#13#10 + 'Motivo: ' + UltimoErro
    else if UltimoAviso <> '' then
      Mensagem := Mensagem + #13#10#13#10 + 'Aviso: ' + UltimoAviso;
    if ArquivoRegistro <> '' then
      Mensagem := Mensagem + #13#10#13#10 + 'Registro completo: ' + ArquivoRegistro;
    MsgBox(Mensagem, mbInformation, MB_OK);
  end;
end;
