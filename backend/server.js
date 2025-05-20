const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();

// Configuração do CORS para produção
const corsOptions = {
  origin: ['https://ecoresidencial.vercel.app/', 'https://ecoresidencialtarbalho.onrender.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Configuração do Multer para produção
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Aceita apenas imagens
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error('Apenas imagens são permitidas!'), false);
    }
    cb(null, true);
  }
});

// Função para ler usuários do arquivo JSON
function lerUsuarios() {
  const caminhoJSON = path.join(__dirname, 'usuarios.json');
  if (fs.existsSync(caminhoJSON)) {
    const dados = fs.readFileSync(caminhoJSON, 'utf8');
    return JSON.parse(dados);
  }
  return [];
}

// Função para salvar usuários no arquivo JSON
function salvarUsuarios(usuarios) {
  const caminhoJSON = path.join(__dirname, 'usuarios.json');
  fs.writeFileSync(caminhoJSON, JSON.stringify(usuarios, null, 2), 'utf8');
}

// Rota de registro
app.post('/registro', async (req, res) => {
  try {
    const { nome, email, senha, tipo } = req.body;
    const usuarios = lerUsuarios();

    // Verificar se o email já está cadastrado
    if (usuarios.some(u => u.email === email)) {
      return res.status(400).json({ mensagem: 'Email já cadastrado' });
    }

    // Criptografar a senha
    const senhaCriptografada = await bcrypt.hash(senha, 10);

    // Criar novo usuário
    const novoUsuario = {
      id: Date.now().toString(),
      nome,
      email,
      senha: senhaCriptografada,
      tipo
    };

    usuarios.push(novoUsuario);
    salvarUsuarios(usuarios);

    res.status(201).json({ mensagem: 'Usuário registrado com sucesso' });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({ mensagem: 'Erro ao registrar usuário' });
  }
});

// Rota de login
app.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuarios = lerUsuarios();

    const usuario = usuarios.find(u => u.email === email);
    if (!usuario) {
      return res.status(401).json({ mensagem: 'Email ou senha inválidos' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha);
    if (!senhaValida) {
      return res.status(401).json({ mensagem: 'Email ou senha inválidos' });
    }

    // Remover a senha antes de enviar os dados do usuário
    const { senha: _, ...usuarioSemSenha } = usuario;
    res.json(usuarioSemSenha);
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ mensagem: 'Erro ao fazer login' });
  }
});

// Middleware para verificar se o usuário é condomínio/reciclador
function verificarTipoUsuario(req, res, next) {
  let usuario = req.body.usuario;
  if (typeof usuario === 'string') {
    try {
      usuario = JSON.parse(usuario);
      req.body.usuario = usuario; // Atualiza para o objeto
    } catch (e) {
      return res.status(400).json({ mensagem: 'Usuário inválido' });
    }
  }
  if (usuario.tipo !== 'condominio' && usuario.tipo !== 'reciclador') {
    return res.status(403).json({ mensagem: 'Acesso permitido apenas para condomínios e recicladores' });
  }
  next();
}

// Rota para adicionar material (apenas para condomínios/recicladores)
app.post('/adicionar', upload.single('imagem'), verificarTipoUsuario, (req, res) => {
  try {
    const novoMaterial = {
      nome: req.body.nome,
      descricao: req.body.descricao,
      quantidade: req.body.quantidade,
      contato: req.body.contato,
      dataCadastro: new Date().toISOString(),
      imagem: req.file ? req.file.filename : null,
      usuarioId: req.body.usuario.id
    };

    const caminhoJSON = path.join(__dirname, 'materiais.json');
    let materiais = [];

    if (fs.existsSync(caminhoJSON)) {
      const dadosExistentes = fs.readFileSync(caminhoJSON, 'utf8');
      materiais = JSON.parse(dadosExistentes);
    }

    materiais.push(novoMaterial);
    fs.writeFileSync(caminhoJSON, JSON.stringify(materiais, null, 2), 'utf8');

    res.json({ mensagem: 'Material salvo com sucesso!' });
  } catch (error) {
    console.error('Erro ao salvar material:', error);
    res.status(500).json({ mensagem: 'Erro ao salvar o material' });
  }
});

// Rota para obter todos os materiais
app.get('/materiais', (req, res) => {
  try {
    const caminhoJSON = path.join(__dirname, 'materiais.json');
    let materiais = [];

    if (fs.existsSync(caminhoJSON)) {
      const dadosExistentes = fs.readFileSync(caminhoJSON, 'utf8');
      materiais = JSON.parse(dadosExistentes);
    }

    res.json(materiais);
  } catch (error) {
    console.error('Erro ao ler materiais:', error);
    res.status(500).json({ mensagem: 'Erro ao carregar os materiais' });
  }
});

// Rota para atualizar perfil
app.put('/atualizar-perfil', async (req, res) => {
  try {
    const { id, nome, email, senha, tipo } = req.body;
    const usuarios = lerUsuarios();
    
    // Encontrar o usuário
    const usuarioIndex = usuarios.findIndex(u => u.id === id);
    if (usuarioIndex === -1) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado' });
    }

    // Verificar se o novo email já está em uso por outro usuário
    const emailEmUso = usuarios.some(u => u.email === email && u.id !== id);
    if (emailEmUso) {
      return res.status(400).json({ mensagem: 'Email já está em uso' });
    }

    // Atualizar dados do usuário
    usuarios[usuarioIndex] = {
      ...usuarios[usuarioIndex],
      nome,
      email,
      tipo
    };

    // Se uma nova senha foi fornecida, atualizar
    if (senha) {
      usuarios[usuarioIndex].senha = await bcrypt.hash(senha, 10);
    }

    // Salvar alterações
    salvarUsuarios(usuarios);

    // Retornar dados atualizados (sem a senha)
    const { senha: _, ...usuarioAtualizado } = usuarios[usuarioIndex];
    res.json(usuarioAtualizado);
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ mensagem: 'Erro ao atualizar perfil' });
  }
});

// Rota para atualizar foto de perfil
app.post('/atualizar-foto-perfil', upload.single('fotoPerfil'), async (req, res) => {
  try {
    const { usuarioId } = req.body;
    const usuarios = lerUsuarios();
    
    // Encontrar o usuário
    const usuarioIndex = usuarios.findIndex(u => u.id === usuarioId);
    if (usuarioIndex === -1) {
      return res.status(404).json({ mensagem: 'Usuário não encontrado' });
    }

    // Se houver uma foto antiga, deletar
    if (usuarios[usuarioIndex].fotoPerfil) {
      const fotoAntiga = path.join(__dirname, 'uploads', usuarios[usuarioIndex].fotoPerfil);
      if (fs.existsSync(fotoAntiga)) {
        fs.unlinkSync(fotoAntiga);
      }
    }

    // Atualizar a foto do usuário
    usuarios[usuarioIndex].fotoPerfil = req.file.filename;
    salvarUsuarios(usuarios);

    res.json({ 
      mensagem: 'Foto de perfil atualizada com sucesso',
      fotoPerfil: req.file.filename
    });
  } catch (error) {
    console.error('Erro ao atualizar foto de perfil:', error);
    res.status(500).json({ mensagem: 'Erro ao atualizar foto de perfil' });
  }
});

// Rota para servir as imagens
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rota para remover material (apenas para condomínios/recicladores)
app.delete('/remover-material/:id', express.json(), verificarTipoUsuario, (req, res) => {
  try {
    const materialId = req.params.id;
    const usuario = req.body.usuario;

    const caminhoJSON = path.join(__dirname, 'materiais.json');
    let materiais = [];

    if (fs.existsSync(caminhoJSON)) {
      const dadosExistentes = fs.readFileSync(caminhoJSON, 'utf8');
      materiais = JSON.parse(dadosExistentes);
    }

    // Só permite remover se o material for do mesmo usuário
    const novoArray = materiais.filter(
      m => !(m.usuarioId == usuario.id && m.dataCadastro === materialId)
    );

    if (novoArray.length === materiais.length) {
      return res.status(404).json({ mensagem: 'Material não encontrado ou permissão negada.' });
    }

    fs.writeFileSync(caminhoJSON, JSON.stringify(novoArray, null, 2), 'utf8');
    res.json({ mensagem: 'Material removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover material:', error);
    res.status(500).json({ mensagem: 'Erro ao remover o material' });
  }
});

// Configuração da porta para produção
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
