; Pulyn.iss - instalador (setup.exe) do Pulyn para o servidor Windows/IIS de um buffet.
; Nao compile direto: use gerar-instalador.ps1, que monta a pasta "montagem" (sistema compilado + instaladores) e chama o ISCC.
;
; A segunda tela pergunta o que fazer:
;   Primeira instalacao: pede IP, senha do postgres, ID da empresa e conexao da nuvem (os dados da empresa vem da nuvem;
;                        nao ha usuario master no buffet); copia o pacote para C:\Pulyn\pacote e roda
;                        BackEnd\deploy\iis\instalar-tudo.ps1 -Modo Instalar
;   Atualizar pela internet: roda atualizar-github.ps1 (git pull da main do GitHub, so o que mudou, backup e publicacao)
;   Atualizar com este instalador: copia o pacote e roda instalar-tudo.ps1 -Modo Atualizar (sem internet)
;   Voltar a versao anterior: roda voltar-versao.ps1, que troca o sistema pela versao guardada em C:\Pulyn\anterior
;   Desinstalar:         roda desinstalar.ps1 (o banco so e apagado se a pessoa marcar, com backup antes)
; O andamento de cada etapa aparece dentro do proprio instalador (o PowerShell roda escondido). O desinstalador de Configuracoes > Aplicativos faz o mesmo que a opcao
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
; Propriedades do setup.exe (Detalhes): empresa e produto Pulyn
VersionInfoCompany=Pulyn
VersionInfoProductName=Pulyn
VersionInfoDescription=Instalador do Pulyn
VersionInfoCopyright=Pulyn
VersionInfoProductTextVersion={#Versao}
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
; Usados pelas opcoes Desinstalar, Atualizar pela internet e Voltar a versao anterior (extraidos para a pasta temporaria)
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\desinstalar.ps1"; Flags: dontcopy solidbreak
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\atualizar-github.ps1"; Flags: dontcopy
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\voltar-versao.ps1"; Flags: dontcopy
Source: "{#Montagem}\pacote\BackEnd\deploy\iis\configurar-empresa.ps1"; Flags: dontcopy
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
  MODO_VOLTAR = 3;
  MODO_DESINSTALAR = 4;
  CHAVE_DESINSTALADOR = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{8F3C2B1A-6D4E-4B7F-9A21-5C3E7D9B0F42}_is1';

var
  PaginaModo: TInputOptionWizardPage;
  PaginaIp: TInputQueryWizardPage;
  CaixaFixarIp: TNewCheckBox;
  NotaFixarIp: TNewStaticText;
  IpDetectado: string;
  PaginaPg: TInputQueryWizardPage;
  PaginaEmpresa: TInputQueryWizardPage;
  PaginaRemover: TInputOptionWizardPage;
  JaInstalado: Boolean;
  TemRestos: Boolean;
  PgInstalado: Boolean;
  VersaoInstalada: string;
  // Versao guardada pela ultima atualizacao (C:\Pulyn\anterior), para "Voltar a versao anterior"
  TemAnterior: Boolean;
  VersaoAnterior: string;
  // Empresa e nuvem que ja estao no .env (atualizacao: a tela "Empresa do buffet" vem com elas e da para trocar)
  EmpresaAtual: string;
  NuvemAtual: string;
  SyncLigado: Boolean;
  EmpresaPreenchida: Boolean;
  CodigoResultado: Integer;

function SetEnvironmentVariable(lpName: string; lpValue: string): Boolean;
  external 'SetEnvironmentVariableW@kernel32.dll stdcall';

function PowerShell: string;
begin
  Result := ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe');
end;

// ---------------------------------------------------------------- andamento dentro do instalador (sem janela de PowerShell)
// O PowerShell roda escondido (via cmd), com a saida indo para um arquivo; o instalador le esse arquivo e mostra as linhas.
// O fim e avisado pelo arquivo codigo.txt (0 = deu certo). Perguntas dos scripts chegam por pergunta.txt e a resposta
// volta por resposta.txt.
function SendMessageW(hWnd: HWND; Msg: UINT; wParam: LongInt; lParam: LongInt): LongInt;
  external 'SendMessageW@user32.dll stdcall';

function PastaAndamento: string;
begin
  // ProgramData: caminho so com ASCII (o cmd le a linha de comando na pagina de codigo do console).
  Result := ExpandConstant('{commonappdata}\PulynSetup');
end;

function IniciarOculto(Parametros: string): Boolean;
var
  Codigo: Integer;
  Saida, FimOk, FimErro: string;
begin
  ForceDirectories(PastaAndamento);
  DeleteFile(PastaAndamento + '\saida.log');
  DeleteFile(PastaAndamento + '\codigo.txt');
  DeleteFile(PastaAndamento + '\pergunta.txt');
  DeleteFile(PastaAndamento + '\resposta.txt');
  Saida := '"' + PastaAndamento + '\saida.log"';
  FimOk := '> "' + PastaAndamento + '\codigo.txt" echo 0';
  FimErro := '> "' + PastaAndamento + '\codigo.txt" echo 1';
  // O processo herda o ambiente: a pasta das perguntas vai por aqui. /s tira as aspas de fora; o resto roda como esta.
  // chcp 1252: o texto sai na mesma pagina de codigo que o instalador le (senao os acentos das mensagens do Windows saem trocados).
  SetEnvironmentVariable('PULYN_PERGUNTA_DIR', PastaAndamento);
  Result := Exec(ExpandConstant('{cmd}'),
    '/d /s /c "chcp 1252 > nul & "' + PowerShell + '" ' + Parametros + ' > ' + Saida + ' 2>&1 && (' + FimOk + ') || (' + FimErro + ')"',
    '', SW_HIDE, ewNoWait, Codigo);
  SetEnvironmentVariable('PULYN_PERGUNTA_DIR', '');
end;

function LerCodigo(var Codigo: Integer): Boolean;
var
  Texto: AnsiString;
begin
  Result := False;
  if LoadStringFromFile(PastaAndamento + '\codigo.txt', Texto) then
    if Trim(String(Texto)) <> '' then
    begin
      Codigo := StrToIntDef(Trim(String(Texto)), 1);
      Result := True;
    end;
end;

function LerSaida(var Linhas: TArrayOfString): Boolean;
begin
  Result := LoadStringsFromFile(PastaAndamento + '\saida.log', Linhas);
end;

// Pergunta pedida por um script (hoje: recriar o banco que sobrou de uma instalacao que parou no meio).
procedure ResponderPergunta;
var
  Texto: AnsiString;
  Arquivo, Resposta: string;
begin
  Arquivo := PastaAndamento + '\pergunta.txt';
  if not FileExists(Arquivo) then Exit;
  if not LoadStringFromFile(Arquivo, Texto) then Exit;
  DeleteFile(Arquivo);
  Resposta := 'N';
  if Trim(String(Texto)) = 'recriar-banco' then
  begin
    if MsgBox('Já existe um banco de dados do Pulyn de uma instalação que não terminou.' + #13#10#13#10 +
      'Ele será APAGADO e criado de novo, vazio (antes é feito um backup em C:\Pulyn\backups).' + #13#10#13#10 +
      'Continuar?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
      Resposta := 'S';
  end;
  SaveStringToFile(PastaAndamento + '\resposta.txt', Resposta, False);
end;

function UltimaLinha(const Linhas: TArrayOfString): string;
var
  I: Integer;
begin
  Result := '';
  for I := GetArrayLength(Linhas) - 1 downto 0 do
    if Trim(Linhas[I]) <> '' then
    begin
      Result := Trim(Linhas[I]);
      if Length(Result) > 90 then Result := Copy(Result, 1, 87) + '...';
      Exit;
    end;
end;

procedure LimparAndamento;
begin
  DelTree(PastaAndamento, True, True, True);
end;

// Roda o PowerShell escondido e mostra o andamento no instalador. Devolve 0 se deu certo.
function RodarComAndamento(Parametros: string): Integer;
var
  Memo: TNewMemo;
  Linhas: TArrayOfString;
  Mostradas, I, Total: Integer;
  Terminou: Boolean;
begin
  Result := -1;
  Memo := TNewMemo.Create(WizardForm);
  Memo.Parent := WizardForm.InstallingPage;
  Memo.Left := WizardForm.ProgressGauge.Left;
  Memo.Top := WizardForm.ProgressGauge.Top + WizardForm.ProgressGauge.Height + ScaleY(12);
  Memo.Width := WizardForm.ProgressGauge.Width;
  Memo.Height := WizardForm.InstallingPage.Height - Memo.Top - ScaleY(4);
  Memo.ReadOnly := True;
  Memo.ScrollBars := ssVertical;
  Memo.WordWrap := True;
  Memo.Font.Name := 'Consolas';
  Memo.Font.Size := 8;
  WizardForm.FilenameLabel.Caption := '';
  WizardForm.ProgressGauge.Style := npbstMarquee;
  if not IniciarOculto(Parametros) then Exit;
  Mostradas := 0;
  repeat
    Sleep(300);
    ResponderPergunta;
    Terminou := LerCodigo(Result);
    if LerSaida(Linhas) then
    begin
      Total := GetArrayLength(Linhas);
      // Enquanto roda, a ultima linha pode estar pela metade: so mostra as completas.
      if not Terminou then Total := Total - 1;
      for I := Mostradas to Total - 1 do
        Memo.Lines.Add(Linhas[I]);
      if Total > Mostradas then
      begin
        Mostradas := Total;
        SendMessageW(Memo.Handle, $00B7, 0, 0); // rola ate o fim
        if UltimaLinha(Linhas) <> '' then WizardForm.FilenameLabel.Caption := UltimaLinha(Linhas);
      end;
    end;
  until Terminou;
  WizardForm.ProgressGauge.Style := npbstNormal;
  WizardForm.FilenameLabel.Caption := '';
  LimparAndamento;
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

// Primeira linha de um VERSAO.txt (C:\Pulyn\pacote = versao no ar; C:\Pulyn\anterior = versao guardada).
function LerVersao(Arquivo: string): string;
var
  Linhas: TArrayOfString;
  Data: string;
begin
  Result := '';
  if LoadStringsFromFile(Arquivo, Linhas) and (GetArrayLength(Linhas) > 0) then
    Result := Trim(Linhas[0]);
  // Formato antigo da atualizacao ("Pulyn GitHub main 2026-11-13 10:11"): mostra so a data.
  if Pos('Pulyn GitHub ', Result) = 1 then
  begin
    Data := Copy(Result, Length(Result) - 15, 16);
    if (Length(Data) = 16) and (Data[5] = '-') and (Data[8] = '-') and (Data[11] = ' ') then
      Result := 'Pulyn atualizado em ' + Copy(Data, 9, 2) + '/' + Copy(Data, 6, 2) + '/' + Copy(Data, 1, 4) + ' ' + Copy(Data, 12, 5)
    else
      StringChangeEx(Result, ' GitHub', '', True);
  end;
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

// Conexao do PostgreSQL da nuvem: postgresql://usuario:senha@servidor:porta/banco (sem espacos nem aspas).
function ConexaoNuvemValida(Url: string): Boolean;
var
  Inicio: string;
begin
  Inicio := Lowercase(Copy(Url, 1, 13));
  Result := ((Copy(Inicio, 1, 13) = 'postgresql://') or (Copy(Inicio, 1, 11) = 'postgres://'))
    and (Pos(' ', Url) = 0) and (Pos('"', Url) = 0) and (Pos('''', Url) = 0) and (Pos('@', Url) > 0);
end;

// ID da empresa: sem espacos, aspas nem barras (vai para o .env e para consultas).
// Valor de uma chave do .env instalado (C:\Pulyn\backend\.env), ou '' se nao houver. So administradores leem o arquivo.
function LerChaveEnv(Chave: string): string;
var
  Linhas: TArrayOfString;
  I, Igual: Integer;
  Linha: string;
begin
  Result := '';
  if not LoadStringsFromFile('C:\Pulyn\backend\.env', Linhas) then Exit;
  for I := 0 to GetArrayLength(Linhas) - 1 do
  begin
    Linha := Trim(Linhas[I]);
    Igual := Pos('=', Linha);
    if (Igual > 1) and (Trim(Copy(Linha, 1, Igual - 1)) = Chave) then
    begin
      Result := Trim(Copy(Linha, Igual + 1, Length(Linha)));
      if (Length(Result) >= 2) and ((Result[1] = '"') or (Result[1] = '''')) and (Result[Length(Result)] = Result[1]) then
        Result := Copy(Result, 2, Length(Result) - 2);
    end;
  end;
end;

// Atualizacao: a pessoa mudou a empresa ou a conexao (ou a sincronizacao ainda nao estava ligada)? Campos vazios = nao mexer.
function EmpresaMudou: Boolean;
begin
  Result := EhAtualizacao and (PaginaEmpresa.Values[0] <> '') and (PaginaEmpresa.Values[1] <> '')
    and ((PaginaEmpresa.Values[0] <> EmpresaAtual) or (PaginaEmpresa.Values[1] <> NuvemAtual) or not SyncLigado);
end;

// Linha da empresa no resumo da atualizacao.
function TextoEmpresa(NewLine: string): string;
begin
  if EmpresaMudou then
  begin
    Result := NewLine + NewLine + 'Empresa: ' + PaginaEmpresa.Values[0];
    if PaginaEmpresa.Values[0] <> EmpresaAtual then
    begin
      if EmpresaAtual <> '' then Result := Result + ' (troca da ' + EmpresaAtual + ')' else Result := Result + ' (nova)';
    end
    else if PaginaEmpresa.Values[1] <> NuvemAtual then
      Result := Result + ' (conexão da nuvem nova)';
    Result := Result + NewLine + 'Antes de atualizar: confere na nuvem, grava no .env, liga a sincronização e reinicia o servidor.';
  end
  else if EmpresaAtual <> '' then
    Result := NewLine + NewLine + 'Empresa: ' + EmpresaAtual + ' (sem mudança)'
  else
    Result := NewLine + NewLine + 'Empresa: não configurada (sem sincronização com a nuvem)';
end;

function IdEmpresaValido(Id: string): Boolean;
begin
  Result := (Length(Id) > 0) and (Pos(' ', Id) = 0) and (Pos('"', Id) = 0) and (Pos('''', Id) = 0)
    and (Pos('\', Id) = 0) and (Pos('/', Id) = 0);
end;

// Fixar o IP = o IP atual da maquina: o campo volta para ele e fica travado.
procedure CaixaFixarIpClick(Sender: TObject);
begin
  if CaixaFixarIp.Checked then
    PaginaIp.Values[0] := IpDetectado;
  PaginaIp.Edits[0].Enabled := not CaixaFixarIp.Checked;
end;

procedure InitializeWizard;
var
  Situacao: string;
begin
  JaInstalado := FileExists('C:\Pulyn\backend\.env');
  TemRestos := JaInstalado or DirExists('C:\Pulyn\backend') or DirExists('C:\Pulyn\site')
    or RegKeyExists(HKLM, 'SYSTEM\CurrentControlSet\Services\PulynBackend');
  PgInstalado := FileExists(ExpandConstant('{commonpf64}\PostgreSQL\18\bin\psql.exe'));
  VersaoInstalada := LerVersao('C:\Pulyn\pacote\VERSAO.txt');
  TemAnterior := JaInstalado and FileExists('C:\Pulyn\anterior\backend\index.js') and FileExists('C:\Pulyn\anterior\site\index.html');
  VersaoAnterior := '';
  if TemAnterior then
  begin
    VersaoAnterior := LerVersao('C:\Pulyn\anterior\VERSAO.txt');
    if VersaoAnterior = '' then VersaoAnterior := 'versão sem identificação';
  end;
  EmpresaAtual := '';
  NuvemAtual := '';
  SyncLigado := False;
  if JaInstalado then
  begin
    EmpresaAtual := LerChaveEnv('SYNC_EMPRESA_ID');
    NuvemAtual := LerChaveEnv('SYNC_NUVEM_URL');
    SyncLigado := LerChaveEnv('SYNC_ENABLED') = '1';
  end;

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
  if TemAnterior then
    PaginaModo.Add('Voltar à versão anterior' + #13#10 + 'Volta para a versão que estava no ar antes da última atualização (' + VersaoAnterior + '). Não precisa de internet. Os dados continuam como estão.')
  else
    PaginaModo.Add('Voltar à versão anterior' + #13#10 + 'Fica disponível depois da primeira atualização: cada atualização guarda a versão que estava no ar.');
  PaginaModo.Add('Desinstalar' + #13#10 + 'Remove o Pulyn deste computador. O banco de dados só é apagado se você escolher.');
  PaginaModo.CheckListBox.ItemEnabled[MODO_INSTALAR] := not JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_ATUALIZAR_GITHUB] := JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_ATUALIZAR_PACOTE] := JaInstalado;
  PaginaModo.CheckListBox.ItemEnabled[MODO_VOLTAR] := TemAnterior;
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
  IpDetectado := DetectarIp;
  PaginaIp.Values[0] := IpDetectado;
  CaixaFixarIp := TNewCheckBox.Create(PaginaIp);
  CaixaFixarIp.Parent := PaginaIp.Surface;
  CaixaFixarIp.Left := PaginaIp.Edits[0].Left;
  CaixaFixarIp.Top := PaginaIp.Edits[0].Top + PaginaIp.Edits[0].Height + ScaleY(16);
  CaixaFixarIp.Width := PaginaIp.SurfaceWidth - CaixaFixarIp.Left;
  CaixaFixarIp.Height := ScaleY(20);
  CaixaFixarIp.Caption := 'Deixar o IP atual fixo no Windows (hoje ele é automático)';
  CaixaFixarIp.Checked := False;
  CaixaFixarIp.Enabled := IpDetectado <> '';
  CaixaFixarIp.OnClick := @CaixaFixarIpClick;
  NotaFixarIp := TNewStaticText.Create(PaginaIp);
  NotaFixarIp.Parent := PaginaIp.Surface;
  NotaFixarIp.Left := CaixaFixarIp.Left + ScaleX(18);
  NotaFixarIp.Top := CaixaFixarIp.Top + CaixaFixarIp.Height + ScaleY(4);
  NotaFixarIp.Width := PaginaIp.SurfaceWidth - NotaFixarIp.Left;
  NotaFixarIp.AutoSize := False;
  NotaFixarIp.WordWrap := True;
  NotaFixarIp.Height := ScaleY(80);
  NotaFixarIp.Caption := 'Nada muda além disso: o mesmo IP, a mesma máscara, o mesmo gateway e os mesmos DNS, só que ' +
    'fixos em vez de automáticos. Se puder, reserve também o IP no roteador, para ele não entregar o mesmo IP a outro aparelho.';

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
  // Senha sugerida (pode ser trocada na tela). Se o PostgreSQL ja existe, e a senha que ele ja deveria ter.
  PaginaPg.Values[0] := 'D200pax@';
  if not PgInstalado then
    PaginaPg.Values[1] := 'D200pax@';

  PaginaEmpresa := CreateInputQueryPage(PaginaPg.ID, 'Empresa do buffet',
    'De qual empresa são os dados deste computador?',
    'Os dados da empresa (eventos, crianças, pulseiras, usuários) são copiados da nuvem agora, e a sincronização já fica ligada. ' +
    'Use o ID da empresa e a conexão da nuvem preparada para este buffet.');
  PaginaEmpresa.Add('ID da empresa:', False);
  PaginaEmpresa.Add('Conexão da nuvem (postgresql://...):', True);

  // ---- 3. desinstalar
  PaginaRemover := CreateInputOptionPage(PaginaEmpresa.ID, 'Desinstalar o Pulyn',
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
  if (PageID = PaginaIp.ID) or (PageID = PaginaPg.ID) then
    Result := Modo <> MODO_INSTALAR
  else if PageID = PaginaEmpresa.ID then
    Result := (Modo <> MODO_INSTALAR) and not EhAtualizacao
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
  else if CurPageID = PaginaEmpresa.ID then
  begin
    PaginaEmpresa.Values[0] := Trim(PaginaEmpresa.Values[0]);
    PaginaEmpresa.Values[1] := Trim(PaginaEmpresa.Values[1]);
    // Na atualizacao, os dois vazios = deixar o .env como esta.
    if EhAtualizacao and (PaginaEmpresa.Values[0] = '') and (PaginaEmpresa.Values[1] = '') then
      Result := True
    else if not IdEmpresaValido(PaginaEmpresa.Values[0]) then
    begin
      MsgBox('Digite o ID da empresa (sem espaços, aspas ou barras).', mbError, MB_OK);
      Result := False;
    end
    else if not ConexaoNuvemValida(PaginaEmpresa.Values[1]) then
    begin
      MsgBox('A conexão da nuvem deve começar com postgresql:// e não pode ter espaços nem aspas.', mbError, MB_OK);
      Result := False;
    end
    else if EhAtualizacao and (EmpresaAtual <> '') and (PaginaEmpresa.Values[0] <> EmpresaAtual) then
      Result := MsgBox('Este computador hoje é da empresa ' + EmpresaAtual + ' e vai passar para a empresa ' + PaginaEmpresa.Values[0] + '.' + #13#10#13#10 +
        'O banco de dados deste computador NÃO é trocado: ele continua com os dados que já tinha, e a sincronização passa a ' +
        'usar a empresa nova.' + #13#10#13#10 + 'Confirma a troca?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
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
  // Atualizacao: a tela da empresa vem com o que ja esta no .env (so na primeira vez que aparece).
  if (CurPageID = PaginaEmpresa.ID) and EhAtualizacao and not EmpresaPreenchida then
  begin
    EmpresaPreenchida := True;
    PaginaEmpresa.Values[0] := EmpresaAtual;
    PaginaEmpresa.Values[1] := NuvemAtual;
    PaginaEmpresa.SubCaptionLabel.Caption :=
      'Estes são o ID da empresa e a conexão da nuvem que este computador usa hoje. Para trocar, mude aqui: antes de atualizar, ' +
      'o instalador confere na nuvem, grava no .env, liga a sincronização e reinicia o servidor. Os dados do banco não mudam.' + #13#10#13#10 +
      'Deixe como está para não mudar nada (os dois vazios também não mudam nada).';
  end;
  if CurPageID = wpReady then
  begin
    if Modo = MODO_DESINSTALAR then
      WizardForm.NextButton.Caption := '&Desinstalar'
    else if EhAtualizacao then
      WizardForm.NextButton.Caption := '&Atualizar'
    else if Modo = MODO_VOLTAR then
      WizardForm.NextButton.Caption := '&Trocar versão'
    else
      WizardForm.NextButton.Caption := '&Instalar';
  end
  else if CurPageID = wpFinished then
  begin
    if CodigoResultado <> 0 then
      WizardForm.FinishedLabel.Caption :=
        'A operação NÃO terminou.' + #13#10#13#10 +
        'O motivo aparece nas últimas linhas do andamento e no registro (C:\Pulyn\logs ou %TEMP%\pulyn-desinstalacao-*.log).' + #13#10#13#10 +
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
    else if Modo = MODO_VOLTAR then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn voltou para a versão anterior (' + VersaoAnterior + ').' + #13#10#13#10 +
        'A versão que estava no ar ficou guardada: para voltar a ela, rode este instalador e escolha "Voltar à versão anterior" de novo, ou atualize.' + #13#10#13#10 +
        'Os dados não mudaram. Os tablets e as placas continuam funcionando.'
    else if Modo = MODO_ATUALIZAR_PACOTE then
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn foi atualizado para a versão {#Versao}.' + #13#10#13#10 +
        'Os tablets e as placas continuam funcionando sem mudar nada.'
    else
      WizardForm.FinishedLabel.Caption :=
        'O Pulyn está no ar em https://' + PaginaIp.Values[0] + #13#10#13#10 +
        'Próximos passos:' + #13#10 +
        '1. Instale o certificado C:\Pulyn\certs\PulynCA.cer em cada tablet e celular.' + #13#10 +
        '2. Entre com o usuário da empresa (ele veio da nuvem). A sincronização com a nuvem já está ligada.' + #13#10 +
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
      'Precisa de internet. Dados, senhas e certificado continuam os mesmos.' + TextoEmpresa(NewLine);
  end
  else if Modo = MODO_ATUALIZAR_PACOTE then
  begin
    Result := 'ATUALIZAR o Pulyn com este instalador (sem internet)';
    if VersaoInstalada <> '' then Result := Result + NewLine + NewLine + 'Instalada: ' + VersaoInstalada;
    Result := Result + NewLine + 'Nova: Pulyn {#Versao}' + NewLine + NewLine +
      'O que acontece:' + NewLine +
      '- backup do banco;' + NewLine +
      '- publicação da versão nova do sistema (servidor e telas).' + NewLine + NewLine +
      'Não são reinstalados: Node.js, PostgreSQL, IIS. Dados, senhas e certificado continuam os mesmos.' + TextoEmpresa(NewLine);
  end
  else if Modo = MODO_VOLTAR then
  begin
    Result := 'VOLTAR À VERSÃO ANTERIOR do Pulyn' + NewLine + NewLine;
    if VersaoInstalada <> '' then Result := Result + 'No ar agora: ' + VersaoInstalada + NewLine;
    Result := Result + 'Vai voltar para: ' + VersaoAnterior + NewLine + NewLine +
      'O que acontece:' + NewLine +
      '- backup do banco;' + NewLine +
      '- o sistema e as telas são trocados pela versão anterior, guardada neste computador;' + NewLine +
      '- a versão que está no ar fica guardada no lugar dela (dá para voltar a ela depois);' + NewLine +
      '- se a versão anterior não funcionar, a troca é desfeita sozinha.' + NewLine + NewLine +
      'Não precisa de internet. O banco de dados NÃO volta: os dados continuam como estão. Senhas e certificado também não mudam.';
  end
  else
  begin
    Result := 'PRIMEIRA INSTALAÇÃO do Pulyn {#Versao}' + NewLine + NewLine +
      'Endereço do sistema: https://' + PaginaIp.Values[0] + NewLine;
    if CaixaFixarIp.Checked then
      Result := Result + 'IP: passa de automático para fixo (mesmo IP, máscara, gateway e DNS)' + NewLine;
    Result := Result + 'Empresa: ' + PaginaEmpresa.Values[0] + ' (dados copiados da nuvem)' + NewLine + NewLine +
      'O andamento de cada etapa aparece aqui no instalador. Pode levar de 5 a 20 minutos.';
  end;
end;

procedure Desinstalar;
var
  Parametros, Desinstalador: string;
  Codigo: Integer;
begin
  WizardForm.StatusLabel.Caption := 'Removendo o Pulyn...';
  ExtractTemporaryFile('config.ps1');
  ExtractTemporaryFile('backup-banco.ps1');
  ExtractTemporaryFile('desinstalar.ps1');
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\desinstalar.ps1') + '" -Sim -SemPausa';
  if PaginaRemover.Values[0] then
    Parametros := Parametros + ' -ApagarBanco';
  CodigoResultado := RodarComAndamento(Parametros);
  // Tira o pacote e o registro em Aplicativos, se o Pulyn foi instalado por um setup (o desinstalador silencioso nao
  // roda o desinstalar.ps1 de novo).
  if RegQueryStringValue(HKLM, CHAVE_DESINSTALADOR, 'UninstallString', Desinstalador) then
    Exec(RemoveQuotes(Desinstalador), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
  if DirExists('C:\Pulyn\pacote') then
    DelTree('C:\Pulyn\pacote', True, True, True);
end;

// Atualizacao com a empresa ou a conexao trocada: grava no .env antes de atualizar (configurar-empresa.ps1).
// Devolve False se nao deu certo (a atualizacao nao roda).
function ConfigurarEmpresa: Boolean;
begin
  WizardForm.StatusLabel.Caption := 'Configurando a empresa e a nuvem...';
  ExtractTemporaryFile('config.ps1');
  ExtractTemporaryFile('configurar-empresa.ps1');
  // A conexao tem senha: vai por variavel de ambiente (herdada pelo PowerShell), nunca pela linha de comando.
  SetEnvironmentVariable('PULYN_EMPRESA_ID', PaginaEmpresa.Values[0]);
  SetEnvironmentVariable('PULYN_NUVEM_URL', PaginaEmpresa.Values[1]);
  CodigoResultado := RodarComAndamento('-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\configurar-empresa.ps1') + '" -SemPausa');
  SetEnvironmentVariable('PULYN_EMPRESA_ID', '');
  SetEnvironmentVariable('PULYN_NUVEM_URL', '');
  Result := CodigoResultado = 0;
end;

procedure AtualizarPeloGithub;
var
  Parametros: string;
begin
  WizardForm.StatusLabel.Caption := 'Atualizando o Pulyn pelo GitHub...';
  ExtractTemporaryFile('config.ps1');
  ExtractTemporaryFile('backup-banco.ps1');
  ExtractTemporaryFile('atualizar-github.ps1');
  ExtractTemporaryFile('MinGit.zip');
  // O atalho "Atualizar Pulyn" usa C:\Pulyn\scripts; instalacoes antigas podem nao ter este script ainda.
  if DirExists('C:\Pulyn\scripts') and not FileExists('C:\Pulyn\scripts\atualizar-github.ps1') then
    FileCopy(ExpandConstant('{tmp}\atualizar-github.ps1'), 'C:\Pulyn\scripts\atualizar-github.ps1', True);
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\atualizar-github.ps1') + '"' +
    ' -MinGitZip "' + ExpandConstant('{tmp}\MinGit.zip') + '" -SemPausa';
  CodigoResultado := RodarComAndamento(Parametros);
end;

procedure VoltarVersao;
var
  Pasta: string;
begin
  WizardForm.StatusLabel.Caption := 'Voltando à versão anterior...';
  // Prefere os scripts da versao que esta no ar (podem ser mais novos que os deste setup). Eles sao copiados para fora de
  // C:\Pulyn\scripts porque essa pasta e trocada durante a volta.
  Pasta := ExpandConstant('{tmp}\voltar');
  if FileExists('C:\Pulyn\scripts\voltar-versao.ps1') and FileExists('C:\Pulyn\scripts\config.ps1')
    and FileExists('C:\Pulyn\scripts\backup-banco.ps1') and ForceDirectories(Pasta)
    and FileCopy('C:\Pulyn\scripts\voltar-versao.ps1', Pasta + '\voltar-versao.ps1', False)
    and FileCopy('C:\Pulyn\scripts\config.ps1', Pasta + '\config.ps1', False)
    and FileCopy('C:\Pulyn\scripts\backup-banco.ps1', Pasta + '\backup-banco.ps1', False) then
    Log('Voltar versao: scripts de C:\Pulyn\scripts')
  else
  begin
    ExtractTemporaryFile('config.ps1');
    ExtractTemporaryFile('backup-banco.ps1');
    ExtractTemporaryFile('voltar-versao.ps1');
    Pasta := ExpandConstant('{tmp}');
    Log('Voltar versao: scripts deste setup');
  end;
  CodigoResultado := RodarComAndamento('-NoProfile -ExecutionPolicy Bypass -File "' + Pasta + '\voltar-versao.ps1" -SemPausa');
end;

procedure InstalarOuAtualizar;
var
  Parametros: string;
begin
  if Modo = MODO_ATUALIZAR_PACOTE then
    WizardForm.StatusLabel.Caption := 'Atualizando o Pulyn...'
  else
    WizardForm.StatusLabel.Caption := 'Configurando o Pulyn (pode levar de 5 a 20 minutos)...';
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\BackEnd\deploy\iis\instalar-tudo.ps1') + '"' +
    ' -Terceiros "' + ExpandConstant('{app}\terceiros') + '"' +
    ' -SiteBuild "' + ExpandConstant('{app}\site-build') + '"';
  ExtractTemporaryFile('MinGit.zip');
  Parametros := Parametros + ' -MinGitZip "' + ExpandConstant('{tmp}\MinGit.zip') + '" -SemPausa';
  if Modo = MODO_INSTALAR then
  begin
    // As senhas vao por variavel de ambiente (herdada pelo PowerShell), nunca pela linha de comando.
    SetEnvironmentVariable('PULYN_PG_ADMIN_SENHA', PaginaPg.Values[0]);
    SetEnvironmentVariable('PULYN_EMPRESA_ID', PaginaEmpresa.Values[0]);
    SetEnvironmentVariable('PULYN_NUVEM_URL', PaginaEmpresa.Values[1]);
    Parametros := Parametros + ' -Modo Instalar -Ip ' + PaginaIp.Values[0];
    if CaixaFixarIp.Checked then
      Parametros := Parametros + ' -FixarIp';
  end
  else
  begin
    Parametros := Parametros + ' -Modo Atualizar';
    // VERSAO.txt da versao que estava no ar (copiado antes de o pacote ser trocado; vai para C:\Pulyn\anterior)
    if FileExists(ExpandConstant('{tmp}\versao-no-ar.txt')) then
      Parametros := Parametros + ' -VersaoNoAr "' + ExpandConstant('{tmp}\versao-no-ar.txt') + '"';
  end;
  CodigoResultado := RodarComAndamento(Parametros);
  SetEnvironmentVariable('PULYN_PG_ADMIN_SENHA', '');
  SetEnvironmentVariable('PULYN_EMPRESA_ID', '');
  SetEnvironmentVariable('PULYN_NUVEM_URL', '');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  // Antes de copiar o pacote novo: guarda o VERSAO.txt da versao no ar (a atualizacao a guarda em C:\Pulyn\anterior).
  if (CurStep = ssInstall) and (Modo = MODO_ATUALIZAR_PACOTE) and FileExists('C:\Pulyn\pacote\VERSAO.txt') then
    FileCopy('C:\Pulyn\pacote\VERSAO.txt', ExpandConstant('{tmp}\versao-no-ar.txt'), False);
  if CurStep <> ssPostInstall then Exit;
#ifdef Previa
  Exit;
#endif
  // Empresa ou conexao trocada na tela "Empresa do buffet": grava antes; se falhar, a atualizacao nao roda.
  if EmpresaMudou then
    if not ConfigurarEmpresa then Exit;
  if Modo = MODO_DESINSTALAR then
    Desinstalar
  else if Modo = MODO_ATUALIZAR_GITHUB then
    AtualizarPeloGithub
  else if Modo = MODO_VOLTAR then
    VoltarVersao
  else
    InstalarOuAtualizar;
end;

// ---------------------------------------------------------------- desinstalador (Configuracoes > Aplicativos)
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Parametros: string;
  Codigo: Integer;
  ApagarBanco: Boolean;
  Linhas: TArrayOfString;
begin
  if CurUninstallStep <> usUninstall then Exit;
  // Silencioso = chamado pela opcao Desinstalar do setup, que ja removeu tudo; aqui so sai o pacote e o registro.
  if UninstallSilent then Exit;
  ApagarBanco := MsgBox('Apagar também o BANCO DE DADOS do Pulyn (crianças, eventos, pulseiras, pontuação)?' + #13#10#13#10 +
    'Sim: antes é feito um backup em C:\Pulyn\backups e depois o banco é apagado.' + #13#10 +
    'Não: o banco fica no PostgreSQL. Instalando o Pulyn de novo, o sistema volta com os mesmos dados.',
    mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  Parametros := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{app}\BackEnd\deploy\iis\desinstalar.ps1') + '" -Sim -SemPausa';
  if ApagarBanco then
    Parametros := Parametros + ' -ApagarBanco';
  // Sem janela de PowerShell: o andamento aparece na janela do proprio desinstalador.
  Codigo := -1;
  if IniciarOculto(Parametros) then
  begin
    repeat
      Sleep(300);
      if LerSaida(Linhas) then
        if UltimaLinha(Linhas) <> '' then UninstallProgressForm.StatusLabel.Caption := UltimaLinha(Linhas);
      until LerCodigo(Codigo);
    LimparAndamento;
  end;
  if Codigo <> 0 then
    MsgBox('A remoção do Pulyn terminou com avisos. Veja o registro pulyn-desinstalacao-*.log na pasta temporária do Windows (%TEMP%).',
      mbInformation, MB_OK);
end;
