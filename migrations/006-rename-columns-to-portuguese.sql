-- Migration: Rename all remaining English columns to Portuguese

-- Tabela: brincadeiras
ALTER TABLE brincadeiras RENAME COLUMN name TO nome;
ALTER TABLE brincadeiras RENAME COLUMN description TO descricao;
ALTER TABLE brincadeiras RENAME COLUMN rules TO regras;
ALTER TABLE brincadeiras RENAME COLUMN type TO tipo;
ALTER TABLE brincadeiras RENAME COLUMN duration TO duracao;

-- Tabela: pontoVerificacao
ALTER TABLE pontoVerificacao RENAME COLUMN name TO nome;
ALTER TABLE pontoVerificacao RENAME COLUMN type TO tipo;
ALTER TABLE pontoVerificacao RENAME COLUMN propositoCheckpoint TO proposito;
ALTER TABLE pontoVerificacao RENAME COLUMN points TO pontos;
ALTER TABLE pontoVerificacao RENAME COLUMN status TO status; -- already Portuguese

-- Tabela: times
ALTER TABLE times RENAME COLUMN name TO nome;
ALTER TABLE times RENAME COLUMN color TO cor;

-- Tabela: clientes
ALTER TABLE clientes RENAME COLUMN name TO nome;
ALTER TABLE clientes RENAME COLUMN city TO cidade;
ALTER TABLE clientes RENAME COLUMN state TO estado;
ALTER TABLE clientes RENAME COLUMN phone TO telefone;

-- Tabela: empresas
ALTER TABLE empresas RENAME COLUMN name TO nome;
ALTER TABLE empresas RENAME COLUMN ciudad TO cidade; -- if exists

-- Tabela: criancas
ALTER TABLE criancas RENAME COLUMN name TO nome;
ALTER TABLE criancas RENAME COLUMN nickname TO apelido;
ALTER TABLE criancas RENAME COLUMN age TO idade;

-- Tabela: zonas
ALTER TABLE zonas RENAME COLUMN name TO nome;
ALTER TABLE zonas RENAME COLUMN color TO cor;

-- Tabela: eventos
ALTER TABLE eventos RENAME COLUMN name TO nome;
ALTER TABLE eventos RENAME COLUMN type TO tipo;
ALTER TABLE eventos RENAME COLUMN status TO status; -- already Portuguese
ALTER TABLE eventos RENAME COLUMN description TO descricao;
ALTER TABLE eventos RENAME COLUMN date TO data;
ALTER TABLE eventos RENAME COLUMN time TO hora;
ALTER TABLE eventos RENAME COLUMN duration TO duracao;

-- Tabela: conquistas
ALTER TABLE conquistas RENAME COLUMN name TO nome;
ALTER TABLE conquistas RENAME COLUMN description TO descricao;
ALTER TABLE conquistas RENAME COLUMN icon TO icone;

-- Tabela: acessos
ALTER TABLE acessos RENAME COLUMN role TO perfil;
ALTER TABLE acessos RENAME COLUMN status TO status; -- already Portuguese

-- Tabela: chamadosSuport
ALTER TABLE chamadosSuport RENAME COLUMN status TO status; -- already Portuguese

-- Tabela: conviteFamilia
-- Already in Portuguese or camelCase

-- Tabela: pulseiras
ALTER TABLE pulseiras RENAME COLUMN status TO status; -- already Portuguese
ALTER TABLE pulseiras RENAME COLUMN code TO codigo;

-- Rename aliases in queries will be handled in code
