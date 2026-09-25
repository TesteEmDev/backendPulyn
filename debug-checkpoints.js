const { pool } = require('./database');

async function check() {
  try {
    const result = await pool.request().query('SELECT id, name, map_x, map_y FROM checkpoints');
    console.log('CHECKPOINTS NO BANCO:');
    console.log('====================');
    
    if (result.recordset.length === 0) {
      console.log('❌ NENHUM CHECKPOINT ENCONTRADO!');
    } else {
      result.recordset.forEach(cp => {
        const hasCoords = cp.map_x !== null && cp.map_y !== null;
        console.log('');
        console.log(`📍 ${cp.name}`);
        console.log(`   ID: ${cp.id}`);
        console.log(`   map_x: ${cp.map_x} ${hasCoords ? '✅' : '❌'}`);
        console.log(`   map_y: ${cp.map_y} ${hasCoords ? '✅' : '❌'}`);
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

check();
