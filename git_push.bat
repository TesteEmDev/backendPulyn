@echo off
cd /d "c:\Users\Walisson\Documents\Pullyn Web\backendPulyn"
echo Adicionando arquivos...
git add routes/leituras.js RASTREIO_AVATAR_CHANGES.md
echo.
echo Fazendo commit...
git commit -m "feat: rastreio de avatar para todos os jogos (Treasure Hunt, Monster Hunt, Zone Conquest)"
echo.
echo Fazendo push...
git push
echo.
echo Concluído!
pause
