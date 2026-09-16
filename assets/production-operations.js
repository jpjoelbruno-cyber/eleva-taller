// V66 — capacidad independiente por operación y ruta productiva persistente por corte.
(function () {
  const OP_ALIASES = {
    '': 'produccion_general',
    'produccion general': 'produccion_general',
    'producción general': 'produccion_general',
    'produção geral': 'produccion_general',
    'producao geral': 'produccion_general',
    reta: 'recta',
    rectista: 'recta',
    over: 'overlock',
    overloque: 'overlock',
    overloquista: 'overlock',
    inter: 'interlock',
    interloque: 'interlock',
    interloquista: 'interlock',
    galonera: 'galoneira',
    galonero: 'galoneira',
    galoneiro: 'galoneira'
  };

  function operationKey(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return OP_ALIASES[normalized] || normalized;
  }

  function uniqueOperations(values) {
    const found = new Map();
    values.filter(Boolean).forEach(value => {
      const label = String(value).trim();
      const key = operationKey(label);
      if (key && !found.has(key)) found.set(key, label);
    });
    return [...found.values()];
  }

  function presetOperations(type) {
    if (type === 'malla') return ['Recta', 'Overlock', 'Galoneira'];
    if (type === 'tejido_plano') return ['Recta', 'Interlock'];
    return [];
  }

  function routeLabel(type) {
    if (type === 'malla') return L('Malla', 'Malha');
    if (type === 'tejido_plano') return L('Tejido plano', 'Tecido plano');
    return L('Personalizada', 'Personalizada');
  }

  productionBase = async function productionBaseByOperation() {
    const [workers, cuts, variants, recent, balances] = await Promise.all([
      qs('funcionarios', '*', 'activo=eq.true&order=nombre.asc'),
      qs('servicios', '*', 'estado=eq.en_proceso&order=created_at.desc'),
      qs('servicio_variantes', '*', 'order=created_at.asc'),
      qs('produccion', '*', 'estado=neq.anulado&order=created_at.desc&limit=500'),
      rpc('saldos_produccion_por_operacion', { p_taller_id: taller.id })
    ]);

    const used = {};
    const operationNames = new Map();
    (balances || []).forEach(row => {
      const key = [row.servicio_id, row.variante_id, row.operacion_clave].join('|');
      used[key] = Number(row.cantidad || 0);
      if (row.operacion_clave && row.operacion) operationNames.set(row.operacion_clave, row.operacion);
    });

    $('content').innerHTML = `
      <section class="card operationDelegationCard">
        <div class="operationTitle">
          <div><small>${L('RUTA DE PRODUCCIÓN', 'ROTA DE PRODUÇÃO')}</small><h2>🧵 ${L('Delegar por operación', 'Delegar por operação')}</h2></div>
          <span class="pill on">${L('CONTROL INDEPENDIENTE', 'CONTROLE INDEPENDENTE')}</span>
        </div>
        <div class="help">${L(
          'El mismo corte puede pasar por Recta, Overlock, Interlock, Galoneira y otras operaciones. Delegar una etapa ya no bloquea las demás.',
          'O mesmo corte pode passar por Reta, Overlock, Interlock, Galoneira e outras operações. Delegar uma etapa não bloqueia mais as demais.'
        )}</div>
        ${!workers.length || !cuts.length ? `<div class="notice">${L('Necesitas funcionarios activos y cortes en proceso.', 'Você precisa de funcionários ativos e cortes em andamento.')}</div>` : `
          <label>${L('Funcionario', 'Funcionário')}</label>
          <select id="pf">${workers.map(worker => `<option value="${worker.id}" data-type="${worker.tipo_pago}" data-val="${worker.valor_base}" data-op="${escAttr(worker.operacion_principal || '')}">${esc(worker.nombre)} · ${humanPay(worker.tipo_pago)}</option>`).join('')}</select>

          <label>${L('Corte activo', 'Corte ativo')}</label>
          <select id="pc"></select>

          <div class="grid2 operationRouteControls">
            <div>
              <label>${L('Tipo de prenda / ruta sugerida', 'Tipo de peça / rota sugerida')}</label>
              <select id="proute">
                <option value="personalizado">${L('Personalizada', 'Personalizada')}</option>
                <option value="malla">${L('Malla · Recta + Overlock + Galoneira', 'Malha · Reta + Overlock + Galoneira')}</option>
                <option value="tejido_plano">${L('Tejido plano · Recta + Interlock', 'Tecido plano · Reta + Interlock')}</option>
              </select>
            </div>
            <div class="routeEditAction"><button id="editRoute" class="soft full">⚙ ${L('Editar etapas', 'Editar etapas')}</button></div>
          </div>
          <div id="routeGuide" class="routeGuide"></div>

          <div class="grid2">
            <div>
              <label>${L('Operación que hará este funcionario', 'Operação deste funcionário')}</label>
              <input id="pop" list="operationSuggestions" placeholder="${L('Ej.: Recta, Overlock, Galoneira', 'Ex.: Reta, Overlock, Galoneira')}">
              <datalist id="operationSuggestions"><option value="Recta"><option value="Overlock"><option value="Interlock"><option value="Galoneira"><option value="Pieza completa"></datalist>
            </div>
            <div>
              <label>${L('R$ por pieza / operación', 'R$ por peça / operação')}</label>
              <input id="pv" class="moneyInput">
            </div>
          </div>
          <div id="operationShortcuts" class="operationShortcuts"></div>
          <div id="operationMatrix" class="operationMatrix"></div>

          <div id="assignBox">
            <div class="grid2">
              <div><label>${L('Talla / color disponible en esta operación', 'Tamanho / cor disponível nesta operação')}</label><select id="pvar"></select></div>
              <div><label>${L('Cantidad', 'Quantidade')}</label><input id="pq" type="number" min="1" inputmode="numeric"></div>
            </div>
            <div id="remainingInfo" class="miniSummary blue"></div>
            <button id="addProd" class="soft full">+ ${L('Agregar al funcionario', 'Adicionar ao funcionário')}</button>
            <div id="prodBasket" class="list"></div>
            <div id="prodTotal" class="miniSummary blue">🔵 ${L('Total', 'Total')}: 0 ${L('piezas', 'peças')}.</div>
            <button id="psv" class="primary full">${L('Guardar esta operación', 'Salvar esta operação')}</button>
          </div>
        `}
      </section>
      <section class="card"><h2>${L('Producción reciente', 'Produção recente')}</h2><div class="list">${recent.slice(0, 25).map(row => {
        const worker = workers.find(item => item.id === row.funcionario_id);
        const cut = cuts.find(item => item.id === row.servicio_id) || {};
        const variant = variants.find(item => item.id === row.variante_id) || {};
        return `<div class="item"><b>${esc(worker?.nombre || L('Funcionario', 'Funcionário'))} · ${esc(cut.proveedor_servicio || '')} · ${L('Corte', 'Corte')} ${esc(cut.numero_corte || '')}</b><div class="muted">${esc(variantText(variant))} · ${esc(row.operacion || '')} · ${Number(row.cantidad || 0)} ${L('piezas', 'peças')}</div></div>`;
      }).join('') || `<div class="empty">${L('Aún no hay producción.', 'Ainda não há produção.')}</div>`}</div></section>`;

    if (!$('pf')) return;
    moneyInput('pv');
    let basket = [];

    const currentOperationKey = () => operationKey($('pop').value);
    const variantsForCut = cutId => variants.filter(item => item.servicio_id === cutId);
    const requiredForCut = cut => uniqueOperations(cut?.operaciones_requeridas || presetOperations(cut?.tipo_material));
    const usedFor = (variantId, cutId, opKey) => Number(used[[cutId, variantId, opKey].join('|')] || 0);
    const capacityForCut = cutId => variantsForCut(cutId).reduce((sum, item) => sum + Number(item.cantidad || 0), 0);

    function operationProgress(cut, operation) {
      const key = operationKey(operation);
      const total = capacityForCut(cut.id);
      const delegated = variantsForCut(cut.id).reduce((sum, item) => sum + Math.min(Number(item.cantidad || 0), usedFor(item.id, cut.id, key)), 0);
      return { key, total, delegated, missing: Math.max(0, total - delegated), complete: total > 0 && delegated >= total };
    }

    function cutRouteState(cut) {
      const required = requiredForCut(cut);
      if (!required.length) return L('ruta por definir', 'rota a definir');
      const missing = required.filter(operation => !operationProgress(cut, operation).complete);
      return missing.length ? L(`faltan ${missing.length} operaciones`, `faltam ${missing.length} operações`) : L('ruta completa', 'rota completa');
    }

    function remaining(variant) {
      const key = currentOperationKey();
      const inBasket = basket.filter(item => item.variante_id === variant.id).reduce((sum, item) => sum + item.cantidad, 0);
      return Math.max(0, Number(variant.cantidad || 0) - usedFor(variant.id, variant.servicio_id, key) - inBasket);
    }

    function renderRouteGuide() {
      const cut = cuts.find(item => item.id === $('pc').value);
      if (!cut) return;
      const required = requiredForCut(cut);
      const optional = cut.tipo_material === 'tejido_plano' ? [L('Overlock opcional', 'Overlock opcional')] : [];
      $('routeGuide').innerHTML = `<b>${routeLabel(cut.tipo_material)}:</b> ${required.length ? required.map(item => `<span>${esc(item)}</span>`).join('') : `<span>${L('elige o escribe las etapas del corte', 'escolha ou informe as etapas do corte')}</span>`}${optional.map(item => `<span class="optional">${esc(item)}</span>`).join('')}`;
    }

    function renderShortcuts() {
      const cut = cuts.find(item => item.id === $('pc').value);
      const required = requiredForCut(cut);
      const common = cut?.tipo_material === 'tejido_plano'
        ? [...required, 'Overlock']
        : [...required, 'Recta', 'Overlock', 'Interlock', 'Galoneira'];
      $('operationShortcuts').innerHTML = uniqueOperations(common).map(operation => `<button type="button" class="${operationKey(operation) === currentOperationKey() ? 'active' : ''}" data-operation="${escAttr(operation)}">${esc(operation)}</button>`).join('');
      $('operationShortcuts').querySelectorAll('button').forEach(button => button.onclick = () => {
        $('pop').value = button.dataset.operation;
        $('pop').dispatchEvent(new Event('change'));
      });
    }

    function renderMatrix() {
      const cut = cuts.find(item => item.id === $('pc').value);
      if (!cut) return;
      const required = requiredForCut(cut);
      const observed = (balances || []).filter(row => row.servicio_id === cut.id).map(row => row.operacion);
      const operations = uniqueOperations([...required, ...observed, $('pop').value]);
      $('operationMatrix').innerHTML = `
        <div class="operationMatrixHead"><div><small>${L('ESTADO DEL MISMO CORTE', 'ESTADO DO MESMO CORTE')}</small><b>${L('Una fila por cada operación', 'Uma linha para cada operação')}</b></div><span>${capacityForCut(cut.id)} ${L('piezas por etapa', 'peças por etapa')}</span></div>
        ${operations.length ? operations.map(operation => {
          const progress = operationProgress(cut, operation);
          const requiredStage = required.some(item => operationKey(item) === progress.key);
          const width = progress.total ? Math.min(100, Math.round(progress.delegated * 100 / progress.total)) : 0;
          return `<div class="operationStage ${progress.complete ? 'complete' : ''}"><div><b>${esc(operation)}</b><small>${requiredStage ? L('ETAPA OBLIGATORIA', 'ETAPA OBRIGATÓRIA') : L('ETAPA REGISTRADA', 'ETAPA REGISTRADA')}</small></div><i><em style="width:${width}%"></em></i><strong>${progress.complete ? '✓ ' + L('Completa', 'Concluída') : `${progress.delegated}/${progress.total} · ${L('faltan', 'faltam')} ${progress.missing}`}</strong></div>`;
        }).join('') : `<div class="empty">${L('Define la ruta o elige la primera operación.', 'Defina a rota ou escolha a primeira operação.')}</div>`}
      `;
    }

    function showRemaining() {
      const variant = variants.find(item => item.id === $('pvar').value);
      const operation = $('pop').value.trim() || L('Producción general', 'Produção geral');
      $('remainingInfo').innerHTML = variant
        ? `🔵 ${esc(operation)}: <b>${remaining(variant)} ${L('piezas disponibles', 'peças disponíveis')}</b>`
        : `✅ ${esc(operation)} ${L('ya está completamente delegada en este corte. Elige otra operación; el corte continúa visible.', 'já está totalmente delegada neste corte. Escolha outra operação; o corte continua visível.')}`;
    }

    function renderBasket() {
      $('prodBasket').innerHTML = basket.map((item, index) => `<div class="item"><b>${esc(item.label)}</b><span class="pill on">${item.cantidad} ${L('piezas', 'peças')}</span><button class="danger" style="float:right" onclick="window.rmProd66(${index})">×</button></div>`).join('') || `<div class="empty">${L('Agrega lo que realizará este funcionario en esta operación.', 'Adicione o que este funcionário fará nesta operação.')}</div>`;
      $('prodTotal').innerHTML = `🔵 ${L('Total delegado ahora', 'Total delegado agora')}: <b>${basket.reduce((sum, item) => sum + item.cantidad, 0)} ${L('piezas', 'peças')}</b>`;
      showRemaining();
    }

    function syncVariants() {
      const cutId = $('pc').value;
      const available = variantsForCut(cutId).filter(item => remaining(item) > 0);
      $('pvar').innerHTML = available.map(item => `<option value="${item.id}">${esc(variantText(item))} · ${L('faltan', 'faltam')} ${remaining(item)}</option>`).join('');
      $('addProd').disabled = !available.length;
      $('pq').disabled = !available.length;
      renderBasket();
      renderMatrix();
    }

    function syncCut() {
      const cut = cuts.find(item => item.id === $('pc').value);
      if (!cut) return;
      $('proute').value = cut.tipo_material || 'personalizado';
      basket = [];
      renderRouteGuide();
      renderShortcuts();
      syncVariants();
    }

    function syncCuts() {
      const selected = $('pc').value;
      const opKey = currentOperationKey();
      const sorted = [...cuts].sort((a, b) => {
        const available = cut => variantsForCut(cut.id).some(item => Number(item.cantidad || 0) - usedFor(item.id, cut.id, opKey) > 0);
        return Number(available(b)) - Number(available(a));
      });
      $('pc').innerHTML = sorted.map(cut => `<option value="${cut.id}">${esc(cut.proveedor_servicio || '')} · ${L('Corte', 'Corte')} ${esc(cut.numero_corte || '')} · ${esc(cut.prenda || '')} · ${esc(cutRouteState(cut))}</option>`).join('');
      if (selected && sorted.some(cut => cut.id === selected)) $('pc').value = selected;
      syncCut();
    }

    function syncWorker() {
      const option = $('pf').selectedOptions[0];
      $('pop').value = option.dataset.op || '';
      $('pv').value = Number(option.dataset.val || 0).toFixed(2);
      basket = [];
      syncCuts();
    }

    async function saveRoute(type, operations) {
      const cut = cuts.find(item => item.id === $('pc').value);
      if (!cut) return;
      const clean = uniqueOperations(operations);
      await update('servicios', cut.id, { tipo_material: type, operaciones_requeridas: clean });
      cut.tipo_material = type;
      cut.operaciones_requeridas = clean;
      renderRouteGuide();
      renderShortcuts();
      renderMatrix();
      syncCuts();
    }

    window.rmProd66 = index => {
      basket.splice(index, 1);
      syncVariants();
    };

    $('pf').onchange = syncWorker;
    $('pc').onchange = syncCut;
    $('pvar').onchange = showRemaining;
    $('pop').onchange = () => {
      basket = [];
      syncCuts();
    };
    $('pop').onblur = () => {
      renderShortcuts();
      syncVariants();
    };
    $('proute').onchange = async () => {
      const type = $('proute').value;
      try {
        await saveRoute(type, presetOperations(type));
      } catch (error) {
        alert(error.message);
        syncCut();
      }
    };
    $('editRoute').onclick = async () => {
      const cut = cuts.find(item => item.id === $('pc').value);
      const current = requiredForCut(cut).join(', ');
      const value = prompt(L('Escribe las etapas obligatorias separadas por coma:', 'Informe as etapas obrigatórias separadas por vírgula:'), current);
      if (value === null) return;
      const operations = value.split(',').map(item => item.trim()).filter(Boolean);
      if (!operations.length) return alert(L('Agrega por lo menos una operación.', 'Adicione pelo menos uma operação.'));
      try {
        $('proute').value = 'personalizado';
        await saveRoute('personalizado', operations);
      } catch (error) {
        alert(error.message);
      }
    };
    $('addProd').onclick = () => {
      const variant = variants.find(item => item.id === $('pvar').value);
      const quantity = Number($('pq').value || 0);
      const available = variant ? remaining(variant) : 0;
      if (!variant || quantity <= 0) return alert(L('Selecciona una talla/color y cantidad.', 'Selecione um tamanho/cor e quantidade.'));
      if (quantity > available) return alert(L(`En esta operación solo quedan ${available} piezas.`, `Nesta operação restam apenas ${available} peças.`));
      const previous = basket.find(item => item.variante_id === variant.id);
      if (previous) previous.cantidad += quantity;
      else basket.push({ variante_id: variant.id, cantidad: quantity, label: variantText(variant) });
      $('pq').value = '';
      syncVariants();
    };
    $('psv').onclick = async () => {
      const button = $('psv');
      const worker = $('pf').selectedOptions[0];
      if (!basket.length) return alert(L('Agrega por lo menos una cantidad disponible.', 'Adicione pelo menos uma quantidade disponível.'));
      disable(button, true);
      try {
        await rpc('registrar_produccion_lote_seguro', {
          p_taller_id: taller.id,
          p_funcionario_id: $('pf').value,
          p_servicio_id: $('pc').value,
          p_operacion: $('pop').value.trim() || L('Producción general', 'Produção geral'),
          p_valor_unitario: num('pv'),
          p_tipo_trabajo: worker.dataset.type === 'pieza' ? 'pieza_completa' : 'operacion',
          p_fecha: today(),
          p_lote_id: opId(),
          p_asignaciones: basket.map(item => ({ variante_id: item.variante_id, cantidad: item.cantidad }))
        });
        await production();
      } catch (error) {
        alert(error.message);
      } finally {
        disable(button, false);
      }
    };

    syncWorker();
  };

  managerDelegate = async function managerDelegateByOperation() {
    const data = managerData || {};
    const workers = (data.funcionarios || []).filter(item => item.activo);
    const cuts = (data.cortes || []).filter(item => item.estado === 'en_proceso');
    if (!workers.length || !cuts.length) return alert(L('Necesitas por lo menos un funcionario y un corte activo.', 'Você precisa de pelo menos um funcionário e um corte ativo.'));

    const workerIndex = Number(prompt(L('Elige funcionario por número:\n', 'Escolha o funcionário pelo número:\n') + workers.map((item, index) => `${index + 1}. ${item.nombre}`).join('\n'), '1')) - 1;
    const cutIndex = Number(prompt(L('Elige corte por número:\n', 'Escolha o corte pelo número:\n') + cuts.map((item, index) => `${index + 1}. ${item.numero_corte} · ${item.prenda}`).join('\n'), '1')) - 1;
    if (!workers[workerIndex] || !cuts[cutIndex]) return alert(L('Selección inválida.', 'Seleção inválida.'));

    const operation = prompt(L('Operación que realizará:', 'Operação que realizará:'), workers[workerIndex].operacion || L('Producción general', 'Produção geral'));
    if (operation === null) return;
    const key = operationKey(operation);
    const variants = (data.variantes || []).filter(item => item.servicio_id === cuts[cutIndex].id);
    const production = (data.produccion || []).filter(item => item.servicio_id === cuts[cutIndex].id && item.estado !== 'anulado' && operationKey(item.operacion) === key);
    const available = variants.map(variant => ({
      ...variant,
      remaining: Math.max(0, Number(variant.cantidad || 0) - production.filter(item => item.variante_id === variant.id).reduce((sum, item) => sum + Number(item.cantidad || 0), 0))
    })).filter(item => item.remaining > 0);
    if (!available.length) return alert(L('Esta operación ya está completamente delegada. Elige otra operación; el corte continúa disponible.', 'Esta operação já está totalmente delegada. Escolha outra operação; o corte continua disponível.'));

    const variantIndex = Number(prompt(L('Elige talla/color por número:\n', 'Escolha tamanho/cor pelo número:\n') + available.map((item, index) => `${index + 1}. ${variantText(item)} · ${L('faltan', 'faltam')} ${item.remaining}`).join('\n'), '1')) - 1;
    const variant = available[variantIndex];
    if (!variant) return alert(L('Selección inválida.', 'Seleção inválida.'));
    const quantity = Number(prompt(L(`Cantidad a delegar en ${operation} (máximo ${variant.remaining}):`, `Quantidade a delegar em ${operation} (máximo ${variant.remaining}):`), String(variant.remaining)));
    if (!quantity || quantity <= 0 || quantity > variant.remaining) return alert(L('Cantidad inválida para esta operación.', 'Quantidade inválida para esta operação.'));

    try {
      await rpc('administrador_delegar_produccion', {
        p_taller_id: taller.id,
        p_funcionario_id: workers[workerIndex].id,
        p_servicio_id: cuts[cutIndex].id,
        p_variante_id: variant.id,
        p_operacion: operation,
        p_cantidad: quantity
      });
      alert(L('Operación delegada. El corte sigue disponible para las etapas que faltan.', 'Operação delegada. O corte continua disponível para as etapas restantes.'));
      managerHome();
    } catch (error) {
      alert(error.message);
    }
  };

  const style = document.createElement('style');
  style.textContent = `
    .operationTitle,.operationMatrixHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .operationTitle small,.operationMatrixHead small{display:block;font-size:10px;font-weight:900;letter-spacing:.75px;color:#b85a15}
    .operationTitle h2{margin:4px 0 8px}
    .operationRouteControls{align-items:end;margin-top:12px}
    .routeEditAction{padding-top:18px}
    .routeGuide{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:10px 0 14px;padding:12px;border-radius:14px;background:#fff8f1;border:1px solid #f0ddcd}
    .routeGuide span{padding:5px 8px;border-radius:9px;background:#fff;color:#78452b;font-size:11px;font-weight:800}
    .routeGuide span.optional{border:1px dashed #d8b99d;background:transparent}
    .operationShortcuts{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
    .operationShortcuts button{min-height:36px;padding:7px 12px;border:1px solid #dbc7b8;border-radius:999px;background:#fff;color:#64402d;font-size:12px;font-weight:800}
    .operationShortcuts button.active{background:#263b4c;border-color:#263b4c;color:#fff}
    .operationMatrix{margin:12px 0 16px;padding:14px;border-radius:17px;background:#f7f9fa;border:1px solid #dfe6ea}
    .operationMatrixHead{align-items:center;margin-bottom:9px}
    .operationMatrixHead b{display:block;margin-top:3px}
    .operationMatrixHead>span{font-size:11px;color:var(--muted);font-weight:800}
    .operationStage{display:grid;grid-template-columns:minmax(120px,1fr) minmax(90px,1.5fr) auto;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #e3e8eb}
    .operationStage>div{display:flex;flex-direction:column}
    .operationStage small{font-size:8px;color:#a96a40;font-weight:900;letter-spacing:.45px}
    .operationStage i{height:7px;border-radius:7px;background:#e1e6e9;overflow:hidden}
    .operationStage em{display:block;height:100%;border-radius:7px;background:#e68a40}
    .operationStage.complete em{background:#2d9a66}
    .operationStage strong{font-size:11px;white-space:nowrap;color:#7a6559}
    .operationStage.complete strong{color:#217247}
    @media(max-width:600px){.operationTitle,.operationMatrixHead{flex-direction:column}.operationTitle .pill{align-self:flex-start}.operationStage{grid-template-columns:1fr auto}.operationStage i{grid-column:1/3;grid-row:2}.operationStage strong{grid-column:2;grid-row:1}.routeEditAction{padding-top:0}}
  `;
  document.head.appendChild(style);
})();
