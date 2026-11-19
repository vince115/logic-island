/*
 * P9.4 Phase D: each island's landmarks as data, beside the S1 interaction specs (island-interactions.ts). One entry
 * per island; the P9 maps draw these landmarks (src/components/p9/landmarks: one list of pieces per island, on the
 * island's landmark sites) and list them in the region's scene definition (src/lib/p9/region-scene.ts), so the World
 * and the Region read the same names and places from here.
 *
 * Rules (tests/island-landmarks.test.ts):
 *   - `site` is an index into the island's landmark sites (src/lib/p9/island-sites.ts, or fixed ones for 資料結構島),
 *     and every site an island's pieces stand on has exactly one landmark here; site 0 is the island's main landmark;
 *   - `interactionId`, when given, names a target of the island's own interaction spec (island-interactions.ts), so a
 *     landmark only ever leads where that spec does: a planned island has info targets only, and no landmark makes a
 *     link of its own. Without it a landmark is for looking at.
 * 基礎程式島 is not here: its landmarks are its GLB's nodes, with their targets in island-interactions.ts.
 */
export interface IslandLandmark {
  landmarkId: string;
  name: string;
  site: number;
  interactionId?: string;
}
export interface IslandLandmarks { islandId: string; landmarks: readonly IslandLandmark[] }

const L = (islandId: string, names: readonly [string, string][]): IslandLandmarks =>
  ({ islandId, landmarks: names.map(([landmarkId, name], site) => ({ landmarkId, name, site })) });

export const ISLAND_LANDMARKS: Readonly<Record<string, IslandLandmarks>> = Object.fromEntries([
  // 程式與資訊群島
  L('structures', [['stack-tower', '堆疊塔'], ['tree-observatory', '樹狀觀測台'], ['graph-bridges', '圖結構橋樑'], ['queue-passage', '佇列通道'], ['queue-passage-east', '佇列通道東段'], ['pier', '碼頭']]),
  L('algorithms', [['research-tower', '演算法研究塔'], ['sorting-arena', '排序競技場'], ['search-maze', '搜尋迷宮'], ['pavilion', '涼亭']]),
  L('databases', [['storage-fortress', '資料儲存堡壘'], ['index-tower', '索引塔'], ['query-center', '查詢中心'], ['quay', '資料碼頭']]),
  L('programming-languages', [['compiler-temple', '編譯器神殿'], ['language-library', '語言圖書館'], ['brace-gate', '大括號門']]),
  L('networks', [['comms-tower', '通訊塔'], ['router-hub', '路由樞紐'], ['relay-station', '中繼站']]),
  L('systems-analysis', [['design-studio', '設計工作室'], ['blueprint-hall', '藍圖大廳'], ['flowchart-garden', '流程圖花園'], ['drafting-tower', '製圖塔']]),
  L('information-systems', [['archive', '檔案館'], ['office-tower', '辦公大樓'], ['dashboard-plaza', '儀表板廣場'], ['warehouse', '倉庫']]),
  // AI 人工智慧群島
  L('large-language-models', [['llm-library', 'LLM 圖書館'], ['token-tower', 'Token 塔'], ['reading-pavilion', '閱讀亭'], ['scroll-stands', '卷軸架']]),
  L('deep-learning', [['neural-tower', '神經網路塔'], ['gpu-hall', 'GPU 機房'], ['node-garden', '節點花園'], ['cooling-plant', '冷卻設施']]),
  L('machine-learning', [['ml-research-center', 'ML 研究中心'], ['data-silos', '資料筒倉'], ['decision-tree', '決策樹雕塑'], ['learning-curve', '學習曲線看板']]),
  L('ai-engineering', [['pipeline-factory', '模型管線工廠'], ['control-tower', '控制塔'], ['deployment-pad', '部署平台'], ['monitors', '監控螢幕']]),
  L('ai-agents', [['agent-control-center', '多代理控制中心'], ['agent-robots', '代理機器人'], ['comms-mast', '通訊桅杆'], ['relay', '中繼站']]),
  L('ai-foundations', [['academy', 'AI 學院'], ['math-obelisk', '數學方尖碑'], ['shape-garden', '幾何花園'], ['benches', '長椅']]),
  L('generative-ai', [['creative-workshop', '創作工坊'], ['prism', '稜鏡雕塑'], ['gallery', '畫廊'], ['colour-blocks', '色塊']]),
  // 數位設計群島
  L('ux-research', [['ux-research-center', 'UX 研究中心'], ['interview-pavilion', '訪談亭'], ['personas', '人物誌雕像'], ['sticky-notes', '便利貼牆']]),
  L('ui-design', [['ui-studio', 'UI 工作室'], ['swatch-tower', '色票塔'], ['button-garden', '按鈕花園'], ['icon-board', '圖示看板']]),
  L('interaction-design', [['prototype-workshop', '原型工坊'], ['kinetic-sculpture', '動態雕塑'], ['touch-pads', '觸控廣場'], ['play-arch', '互動拱門']]),
  L('design-systems', [['system-gallery', '設計系統展示館'], ['component-shelves', '元件架'], ['token-totem', 'Token 圖騰'], ['type-wall', '字體牆']]),
  // 網頁與應用開發群島
  L('frontend', [['component-center', '元件研究中心'], ['component-stack', '元件塔'], ['dev-board', '開發看板'], ['lamps', '路燈']]),
  L('web-foundations', [['box-model-workshop', 'HTML/CSS 工坊'], ['tag-arch', '標籤拱門'], ['style-shelves', '樣式架'], ['lantern', '燈塔']]),
  L('mobile-apps', [['phone-tower', '手機塔'], ['app-tiles', 'App 圖示磚'], ['charging-pad', '充電台'], ['antenna', '天線']]),
  L('responsive-design', [['responsive-pavilion', '響應式展館'], ['flex-grid', '彈性網格'], ['rulers', '量尺'], ['lamp', '路燈']]),
  // 系統與雲端工程群島
  L('linux-systems', [['linux-control-center', 'Linux 控制中心'], ['shell-tower', 'Shell 塔'], ['file-tree-racks', '檔案樹機櫃'], ['lamp', '路燈']]),
  L('network-servers', [['comms-tower', '網路通訊塔'], ['server-hall', '伺服器機房'], ['security-gate', 'DNS/TLS 安全閘門'], ['cable-house', '纜線房']]),
  L('devops-cicd', [['pipeline-factory', 'CI/CD 管線工廠'], ['test-station', '測試站'], ['release-ramp', '發布坡道'], ['gears', '齒輪']]),
  L('docker-containers', [['container-base', '貨櫃基地'], ['container-yard', '貨櫃場'], ['harbour-crane', '港口吊車'], ['whale', '鯨魚']]),
  L('cloud-infrastructure', [['cloud-center', '雲端部署中心'], ['data-centre', '資料中心'], ['cooling', '冷卻設施'], ['landing-pad', '起降平台']]),
  L('kubernetes-reliability', [['slo-observatory', 'SLO 觀測站'], ['pod-cluster', 'Pod 叢集'], ['monitoring-wall', '監控牆'], ['gauge-garden', '儀表花園']]),
].map(entry => [entry.islandId, entry]));

export const islandLandmarks = (islandId: string): readonly IslandLandmark[] => ISLAND_LANDMARKS[islandId]?.landmarks ?? [];
