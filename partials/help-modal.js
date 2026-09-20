/* ===================================================================
 * partials/help-modal.js — 使用帮助弹窗
 *   HTML 常量 + openHelp / closeHelp / switchHelpTab
 *
 * 依赖：
 *   - main.js ：openModalEl / closeModalEl
 * =================================================================== */

const HELP_MODAL_HTML = `
<div class="modal-box help-box">
  <div class="settings-head">
    <div class="settings-tabs">
      <button type="button" class="settings-tab active" id="helpTabBasic" onclick="switchHelpTab('basic')">📖 基础</button>
      <button type="button" class="settings-tab" id="helpTabDict" onclick="switchHelpTab('dict')">📝 默写</button>
      <button type="button" class="settings-tab" id="helpTabSync" onclick="switchHelpTab('sync')">☁️ 同步</button>
      <button type="button" class="settings-tab" id="helpTabShortcut" onclick="switchHelpTab('shortcut')">⌨️ 快捷键</button>
    </div>
    <button type="button" class="modal-close" onclick="closeHelp()" title="关闭">✕</button>
  </div>

  <div class="settings-pane help-pane" id="helpPaneBasic">
    <div class="set-group">
      <h3>章节管理</h3>
      <ul>
        <li>在顶部搜索框输入章节名，从下拉列表勾选要默写的章节。</li>
        <li>只有勾选的章节才会出现在下方列表中。</li>
        <li>拖动行首 <b>≡</b> 可排序（编辑模式下）。</li>
        <li>点 <b>✎</b> 改名，点 <b>🗑</b> 删除（连同单词一起删）。</li>
        <li>点表头「章节名称」「单词数」可按该列排序。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>单词管理</h3>
      <ul>
        <li>「数据操作 → 新增」里可切换「新增章节 / 新增单词」。</li>
        <li>单词列表支持搜索、排序、拖拽。</li>
        <li>点击单词文本展开详情：练习次数、正确率、最后日期等。</li>
        <li><b>🧹 去重</b> 让同名单词只显示第一条。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>列表模式</h3>
      <ul>
        <li>点 <b>👁 查看</b> 切换为查看模式，禁止编辑 / 删除 / 拖拽。</li>
        <li>点 <b>✏️ 编辑</b> 切回编辑模式。</li>
      </ul>
    </div>
  </div>

  <div class="settings-pane help-pane hidden" id="helpPaneDict">
    <div class="set-group">
      <h3>开始默写</h3>
      <ul>
        <li>先勾选章节，再点 <b>🚀 开始默写</b>。</li>
        <li>按设置里的「报词方式 / 范围 / 顺序」自动播报。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>播报控制</h3>
      <ul>
        <li><b>⏮ 上一个</b> / <b>⏭ 下一个</b>：切换单词，2 秒后播报。</li>
        <li><b>🔁 重播</b>：重播当前单词。</li>
        <li><b>⏸ 暂停</b>：暂停计时与播报，点「继续」恢复。</li>
        <li><b>⏹ 停止</b>：提前结束，进入复习阶段。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>复习与评分</h3>
      <ul>
        <li>播报结束后逐个标记 <b>✓ 正确</b> / <b>✗ 错误</b>。</li>
        <li>未标记的单词默认视为正确。</li>
        <li>点 <b>✅ 标记完成，出分数</b> 查看成绩。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>参数说明</h3>
      <ul>
        <li><b>播报间隔</b>：词与词之间等待时长（4 字词 ×2）。</li>
        <li><b>每词遍数</b>：每个词播几遍。</li>
        <li><b>每遍间隔</b>：词内两遍之间等待时长。</li>
      </ul>
    </div>
  </div>

  <div class="settings-pane help-pane hidden" id="helpPaneSync">
    <div class="set-group">
      <h3>四种同步方式</h3>
      <ul>
        <li><b>合并更新（默认）</b>：谁有补谁，不删任何东西。最安全。</li>
        <li><b>云端优先</b>：同名章节以云端为准，本地独有章节保留。</li>
        <li><b>云端覆盖</b>：一切以云端为准，本地独有章节和单词全删。<span class="danger-text">⚠ 危险</span></li>
        <li><b>仅新增</b>：只补云端新章节，已有章节完全不动。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>数据备份</h3>
      <ul>
        <li><b>数据操作 → 导出</b>：把当前数据保存为 JSON 文件。</li>
        <li><b>数据操作 → 导入</b>：从 JSON 文件恢复，按章节名合并。</li>
        <li>清缓存 / 换设备前建议先导出备份。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>删除的数据会怎样</h3>
      <ul>
        <li>本地删除的章节会记入黑名单，云端同步时不会复活。</li>
        <li>在「设置 → 同步策略」里可切换默认策略。</li>
      </ul>
    </div>
  </div>

  <div class="settings-pane help-pane hidden" id="helpPaneShortcut">
    <div class="set-group">
      <h3>弹窗</h3>
      <ul>
        <li><b>Enter</b>：确认（等同点 √）。</li>
        <li><b>Esc</b>：关闭最上层弹窗。</li>
        <li><b>Tab</b>：在弹窗内循环切换焦点。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>默写中</h3>
      <ul>
        <li>点「重播」可反复听当前单词。</li>
        <li>「暂停」和「继续」切换时计时不中断。</li>
        <li>2 秒冷却期内可再点「上一个 / 下一个 / 重播」提前打断。</li>
      </ul>
    </div>
    <div class="set-group">
      <h3>搜索</h3>
      <ul>
        <li>输入章节名时下拉列表自动展开。</li>
        <li><b>↑ / ↓</b> 选中，<b>Enter</b> 勾选 / 取消勾选。</li>
        <li><b>Esc</b> 关闭下拉。</li>
      </ul>
    </div>
  </div>
</div>
`;

/** Tab 切换 */
function switchHelpTab(tab) {
  const map = {
    basic: ["helpTabBasic", "helpPaneBasic"],
    dict: ["helpTabDict", "helpPaneDict"],
    sync: ["helpTabSync", "helpPaneSync"],
    shortcut: ["helpTabShortcut", "helpPaneShortcut"],
  };
  Object.keys(map).forEach((k) => {
    const [tabId, paneId] = map[k];
    const t = document.getElementById(tabId);
    const p = document.getElementById(paneId);
    if (t) t.classList.toggle("active", k === tab);
    if (p) p.classList.toggle("hidden", k !== tab);
  });
}

/** 打开帮助弹窗 */
function openHelp() {
  const m = document.getElementById("helpModal");
  if (!m) {
    console.error("#helpModal 不存在");
    return;
  }
  if (!m.innerHTML.trim()) {
    m.innerHTML = HELP_MODAL_HTML;
  }
  switchHelpTab("basic");
  openModalEl(m);
}

/** 关闭帮助弹窗 */
function closeHelp() {
  closeModalEl(document.getElementById("helpModal"));
}
