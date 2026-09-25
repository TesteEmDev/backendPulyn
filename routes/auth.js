// routes/auth.js - Autenticação


    // Atualizar último acesso
    await query(
      'UPDATE logins SET ultimo_acesso = GETDATE() WHERE id = @id',
      { id: login.id }
    );

    // Definir redirect baseado no role
    const roleRedirects = {
      'admin': '/admin',
      'reception': '/reception',
      'game_master': '/game-master',
      'display': '/display',
      'family': '/family',
      'master': '/master',
      'kiosk': '/reception/kiosk',
      'score_kiosk': '/score-kiosk'
    };

    res.json({
      success: true,
      token: token,
      user: {
        id: login.id,
        name: login.family_name || login.empresa_nome,
        email: login.email,
        role: login.role,
        redirect: roleRedirects[login.role] || '/admin',
        plan: login.plano,
        empresa_id: login.empresa_id
      }
    });
  catch (err) {
    console.error('❌ Erro ao fazer login:', err);
    res.status(500).json({ error: err.message });
  }
;

// Logout (opcional - apenas para logs)
router.post('/logout', async (req, res) => {
  try {
    console.log('👋 Logout realizado');
    res.json({ success: true, message: 'Logout realizado com sucesso' });
  } catch (err) {
    console.error('❌ Erro ao fazer logout:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
