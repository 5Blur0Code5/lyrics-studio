import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView,
  SafeAreaView, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import CryptoJS from 'crypto-js';

const GENRE_DATA = [
  { id: "gfunk",   label: "Old-school West Coast G-funk", icon: "☀️", bpm: 90  },
  { id: "trap",    label: "Dark Atlanta trap",             icon: "💀", bpm: 140 },
  { id: "emo",     label: "Dreamlike emo rap",             icon: "🌧️", bpm: 120 },
  { id: "drill",   label: "Aggressive drill cadence",      icon: "🔪", bpm: 142 },
  { id: "narco",   label: "Cinematic narco tone",          icon: "💼", bpm: 85  },
  { id: "street",  label: "Raw street freestyle",          icon: "🎤", bpm: 95  },
  { id: "melodic", label: "Emotional melodic rap",         icon: "🌊", bpm: 110 },
];

const FLOW_OPTIONS       = ["Straight Flow", "Syncopated Off-Beat", "Staccato Sharp", "Double-Time Chopper", "Triplet Migos-Style", "Lazy Behind-Beat"];
const DELIVERY_OPTIONS   = ["Calm Narrative", "Aggressive Street", "Cinematic Whisper", "High-Energy Shouted", "Gritty Raspy", "Emotional / Tearful"];
const RHYME_OPTIONS      = ["Simple End Rhymes", "Internal Multi-Syllabic", "Dense Layered Structures", "Slant Rhyme Heavy", "Freeform Poetic"];
const COMPLEXITY_OPTIONS = ["Basic", "Intermediate", "Advanced", "Elite Engineering"];

// ─── CopyBox ────────────────────────────────────────────────────────────────
const CopyBox = ({ title, content, style }: { title: string; content: string; style?: object }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.copyBoxContainer, style]}>
      <View style={styles.copyBoxHeader}>
        <Text style={styles.copyBoxTitle}>{title}</Text>
        <TouchableOpacity onPress={handleCopy}>
          <Text style={[styles.copyBoxBtn, copied && styles.textGreen]}>
            {copied ? 'SUCCESS' : 'COPY'}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.copyBoxScroll} nestedScrollEnabled>
        <Text style={styles.copyBoxContent}>{content || 'No content yet'}</Text>
      </ScrollView>
    </View>
  );
};

// ─── SelectionGroup ──────────────────────────────────────────────────────────
// FIX: toggleFunc now only receives `id`; each call-site wraps its own state.
const SelectionGroup = ({
  label,
  items,
  activeItems,
  toggleFunc,
  isGenre = false,
}: {
  label: string;
  items: string[];
  activeItems: string[];
  toggleFunc: (id: string) => void;
  isGenre?: boolean;
}) => (
  <View style={styles.mb4}>
    <Text style={styles.sectionLabel}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionGroupWrap}>
      {(isGenre ? GENRE_DATA : items.map(i => ({ id: i, label: i, icon: '' }))).map(item => {
        const id       = item.id;
        const isActive = activeItems.includes(id);
        return (
          <TouchableOpacity
            key={id}
            onPress={() => toggleFunc(id)}   // FIX: just pass id
            style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}
          >
            <Text style={isActive ? styles.pillTextActive : styles.pillTextInactive}>
              {isGenre && item.icon ? `${item.icon} ` : ''}{item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [isGenerating,   setIsGenerating]   = useState(false);
  const [parsedOutput,   setParsedOutput]   = useState<{ title: string; style: string; lyrics: string } | null>(null);
  const [apiKeys,        setApiKeys]        = useState<string[]>([]);
  const [apiKeyRaw,      setApiKeyRaw]      = useState('');
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [pin,            setPin]            = useState('');
  const [isUnlocked,     setIsUnlocked]     = useState(false);
  const [prompt,         setPrompt]         = useState('');
  const [mimicMode,      setMimicMode]      = useState('');
  const [statusMsg,      setStatusMsg]      = useState('Standby');
  const [showWarning,    setShowWarning]    = useState(false);
  const [vaultExists,    setVaultExists]    = useState(false);

  // Selection states
  const [selectedGenres,      setSelectedGenres]      = useState([GENRE_DATA[0].id]);
  const [selectedFlows,       setSelectedFlows]       = useState([FLOW_OPTIONS[1]]);
  const [selectedDeliveries,  setSelectedDeliveries]  = useState([DELIVERY_OPTIONS[1]]);
  const [selectedRhymes,      setSelectedRhymes]      = useState([RHYME_OPTIONS[1]]);
  const [selectedComplexities,setSelectedComplexities]= useState([COMPLEXITY_OPTIONS[3]]);

  useEffect(() => {
    (async () => {
      const warningDismissed = await AsyncStorage.getItem('omnios_warning_dismissed');
      if (!warningDismissed) setShowWarning(true);
      const vault = await AsyncStorage.getItem('omnios_vault');
      if (vault) setVaultExists(true);
    })();
  }, []);

  // ── Generic toggle (requires at-least-one selection) ──
  const toggle = (id: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (list.includes(id)) {
      if (list.length > 1) setList(list.filter(i => i !== id));
    } else {
      setList([...list, id]);
    }
  };

  const dismissWarning = async () => {
    await AsyncStorage.setItem('omnios_warning_dismissed', 'true');
    setShowWarning(false);
  };

  const handleAuth = async (mode: 'save' | 'load') => {
    if (mode === 'save') {
      const keyArray = apiKeyRaw.split(',').map(k => k.trim()).filter(k => k);
      if (!keyArray.length || !pin) {
        Alert.alert("VAULT ERROR", "KEY + PIN REQUIRED");
        return;
      }
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(keyArray), pin).toString();
      await AsyncStorage.setItem('omnios_vault', encrypted);
      setApiKeys(keyArray);
      setIsUnlocked(true);
      setPin('');
      setApiKeyRaw('');
      setVaultExists(true);
    } else {
      try {
        const vaultData = await AsyncStorage.getItem('omnios_vault');
        if (!vaultData) throw new Error("No vault");
        const bytes     = CryptoJS.AES.decrypt(vaultData, pin);
        const decrypted = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        if (Array.isArray(decrypted)) {
          setApiKeys(decrypted);
          setIsUnlocked(true);
          setPin('');
        }
      } catch {
        Alert.alert("VAULT ERROR", "PIN REJECTED");
      }
    }
  };

  const executeSequence = async (retryIndex = 0) => {
    if (retryIndex >= apiKeys.length) {
      Alert.alert("ERROR", "ALL KEYS EXHAUSTED.");
      setIsGenerating(false);
      return;
    }

    setActiveKeyIndex(retryIndex);
    const currentKey = apiKeys[retryIndex];
    const genres     = GENRE_DATA.filter(g => selectedGenres.includes(g.id));
    const avgBpm     = genres.length ? genres.reduce((acc, curr) => acc + curr.bpm, 0) / genres.length : 110;

    const systemPrompt = `
You are ADVANCED AI LYRICS STUDIO. Generate professional cinematic lyrics.

--- THE 4TH WALL PROTOCOL (CRITICAL) ---
1. NEVER use technical labels in the verses.
2. Describe style ONLY in the STYLE DESCRIPTION section.
3. Lyrics must be 100% in-character storytelling.

--- TEMPORAL LOGIC ---
Anchor lyrics with [MM:SS] markers at transitions and every 8 bars (~${(480 / avgBpm).toFixed(1)}s).

--- FUSION PROFILE ---
Genres: ${genres.map(g => g.label).join(' + ')} | Rhythm: ${selectedFlows.join(', ')} | Delivery: ${selectedDeliveries.join(', ')} | Mimic Profile: ${mimicMode || 'Original Hybrid'}.

--- NARRATIVE ARC ---
${prompt || 'Autonomous cinematic narrative.'}

FORMAT:
--- TITLE ---
[Title]
--- STYLE DESCRIPTION ---
[Sonic details]
--- LYRICS ---
[Lyrics with [MM:SS] markers]
    `.trim();

    try {
      setStatusMsg(`KEY_${retryIndex + 1}_INIT...`);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${currentKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.9 },
          }),
        }
      );

      if (!response.ok) throw new Error("Failover Triggered");

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      const titleMatch  = text.match(/--- TITLE ---\s*([\s\S]*?)\s*--- STYLE DESCRIPTION ---/i);
      const styleMatch  = text.match(/--- STYLE DESCRIPTION ---\s*([\s\S]*?)\s*--- LYRICS ---/i);
      const lyricsMatch = text.match(/--- LYRICS ---\s*([\s\S]*)/i);

      setParsedOutput({
        title:  titleMatch  ? titleMatch[1].trim().replace(/\*/g, '')  : "SESSION_ALPHA",
        style:  styleMatch  ? styleMatch[1].trim()                     : "SONIC_PROFILE",
        lyrics: lyricsMatch ? lyricsMatch[1].trim()                    : text,
      });

      setIsGenerating(false);
      setStatusMsg('ONLINE');
    } catch (e) {
      console.warn("Key failed, retrying...", e);
      executeSequence(retryIndex + 1);
    }
  };

  const purgeVault = async () => {
    await AsyncStorage.removeItem('omnios_vault');
    setIsUnlocked(false);
    setVaultExists(false);
    setApiKeys([]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>

          {/* Warning Modal */}
          <Modal visible={showWarning} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.glassPanel, styles.warningPanel]}>
                <Text style={styles.warningTitle}>⚠️ Wall Protocol</Text>
                <Text style={styles.warningText}>
                  The 4th Wall Protocol is active. Technical descriptors will be synthesized as performance cues only.
                </Text>
                <Text style={styles.warningText}>API Failover is armed.</Text>
                <TouchableOpacity style={styles.warningBtn} onPress={dismissWarning}>
                  <Text style={styles.warningBtnText}>INITIALIZE ENGINE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Header */}
          <View style={styles.glassPanel}>
            <View style={styles.headerFlex}>
              <View>
                <Text style={styles.mainTitle}>
                  ADVANCED AI <Text style={styles.textCyan}>LYRICS STUDIO</Text>
                </Text>
                <Text style={styles.subTitle}>Lyrical Purity System 5.1</Text>
              </View>
              <View style={styles.alignRight}>
                <Text style={styles.vaultLabel}>VAULT</Text>
                <Text style={styles.vaultCount}>{isUnlocked ? apiKeys.length : '0'}</Text>
              </View>
            </View>
          </View>

          {/* Vault */}
          <View style={styles.glassPanel}>
            {!isUnlocked ? (
              <View style={styles.gap3}>
                <TextInput
                  style={[styles.input, { height: 60 }]}
                  placeholder="API Keys (comma separated)..."
                  placeholderTextColor="#555"
                  multiline
                  value={apiKeyRaw}
                  onChangeText={setApiKeyRaw}
                />
                <View style={styles.rowGap}>
                  <TextInput
                    style={[styles.input, styles.flex1, styles.textCenter]}
                    placeholder="PIN"
                    placeholderTextColor="#555"
                    secureTextEntry
                    maxLength={6}
                    value={pin}
                    onChangeText={setPin}
                  />
                  <TouchableOpacity
                    style={styles.unlockBtn}
                    onPress={() => handleAuth(vaultExists ? 'load' : 'save')}
                  >
                    <Text style={styles.unlockBtnText}>
                      {vaultExists ? 'UNLOCK' : 'SAVE'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.unlockedHeader}>
                <Text style={styles.unlockedText}>
                  🛡️ LINK_ESTABLISHED (KEY_{activeKeyIndex + 1})
                </Text>
                <TouchableOpacity onPress={purgeVault}>
                  <Text style={styles.purgeText}>PURGE VAULT</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Fusion Controls */}
          <View style={styles.glassPanel}>
            {/* FIX: each SelectionGroup gets a self-contained toggleFunc */}
            <SelectionGroup
              label="Architecture Fusion"
              items={[]}
              activeItems={selectedGenres}
              toggleFunc={id => toggle(id, selectedGenres, setSelectedGenres)}
              isGenre
            />
            <SelectionGroup
              label="Rhythmic Patterns"
              items={FLOW_OPTIONS}
              activeItems={selectedFlows}
              toggleFunc={id => toggle(id, selectedFlows, setSelectedFlows)}
            />
            <SelectionGroup
              label="Delivery Texture"
              items={DELIVERY_OPTIONS}
              activeItems={selectedDeliveries}
              toggleFunc={id => toggle(id, selectedDeliveries, setSelectedDeliveries)}
            />
            <SelectionGroup
              label="Rhyme Engineering"
              items={RHYME_OPTIONS}
              activeItems={selectedRhymes}
              toggleFunc={id => toggle(id, selectedRhymes, setSelectedRhymes)}
            />
            <SelectionGroup
              label="Complexity Processing"
              items={COMPLEXITY_OPTIONS}
              activeItems={selectedComplexities}
              toggleFunc={id => toggle(id, selectedComplexities, setSelectedComplexities)}
            />

            <TextInput
              style={[styles.input, styles.mt2]}
              placeholder="Artist Archetype Mimic (optional)..."
              placeholderTextColor="#555"
              value={mimicMode}
              onChangeText={setMimicMode}
            />
          </View>

          {/* Prompt & Generate */}
          <View style={styles.glassPanel}>
            <TextInput
              style={[styles.input, { height: 80 }]}
              multiline
              placeholder="Enter cinematic narrative arc or thematic core..."
              placeholderTextColor="#555"
              value={prompt}
              onChangeText={setPrompt}
            />
            <TouchableOpacity
              style={[styles.generateBtn, isGenerating ? styles.btnGenerating : styles.btnActive]}
              disabled={isGenerating || !isUnlocked}
              onPress={() => { setIsGenerating(true); executeSequence(0); }}
            >
              <Text style={[styles.generateBtnText, isGenerating && styles.textCyanDim]}>
                {isGenerating ? 'ROUTING DATA...' : 'EXECUTE MULTI-FUSION'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Output */}
          <View style={[styles.glassPanel, { minHeight: 500 }]}>
            <View style={styles.outputHeader}>
              <Text style={styles.outputTitle}>
                {parsedOutput ? parsedOutput.title : 'STANDBY'}
              </Text>
              <View style={[styles.statusBadge, isUnlocked ? styles.borderCyan : styles.borderRed]}>
                <Text style={[styles.statusText, isUnlocked ? styles.textCyan : styles.textRed]}>
                  {isUnlocked ? statusMsg : 'OFFLINE'}
                </Text>
              </View>
            </View>

            {isGenerating ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00ffff" />
                <Text style={styles.loadingText}>
                  ISOLATING TECHNICAL METADATA...{"\n"}CONSTRUCTING WALL-PROOF VERSE
                </Text>
              </View>
            ) : parsedOutput ? (
              <View style={styles.flex1}>
                <CopyBox title="SONIC PROFILE"      content={parsedOutput.style}  style={{ height: 150, marginBottom: 15 }} />
                <CopyBox title="LYRICAL MANUSCRIPT" content={parsedOutput.lyrics} style={{ flex: 1, minHeight: 300 }} />
              </View>
            ) : (
              <Text style={styles.loadingText}>Generate lyrics to see output here</Text>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#050505' },
  scrollContent: { padding: 16, gap: 16 },
  flex1:         { flex: 1 },

  glassPanel: {
    backgroundColor: 'rgba(17, 17, 21, 0.7)',
    borderColor:     'rgba(0, 255, 255, 0.15)',
    borderWidth:     1,
    borderRadius:    12,
    padding:         16,
    marginBottom:    16,
  },

  headerFlex: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  mainTitle:  { fontSize: 20, fontWeight: '900', fontStyle: 'italic', color: '#fff' },
  textCyan:   { color: '#00ffff' },
  subTitle:   { fontSize: 9, color: '#6b7280', marginTop: 4, letterSpacing: 3, textTransform: 'uppercase' },
  alignRight: { alignItems: 'flex-end' },
  vaultLabel: { fontSize: 9, color: '#4b5563' },
  vaultCount: { fontSize: 20, color: '#00ffff', lineHeight: 24 },

  gap3:   { gap: 12 },
  rowGap: { flexDirection: 'row', gap: 8 },

  input: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderColor:     '#1f2937',
    borderWidth:     1,
    borderRadius:    4,
    padding:         12,
    color:           '#d1d5db',
    fontSize:        12,
    fontFamily:      Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  textCenter: { textAlign: 'center', letterSpacing: 4 },

  unlockBtn:     { backgroundColor: '#00cccc', paddingHorizontal: 24, justifyContent: 'center', borderRadius: 4 },
  unlockBtnText: { color: '#000', fontWeight: '900', fontSize: 10, fontStyle: 'italic', letterSpacing: 2 },

  unlockedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unlockedText:   { color: '#00ffff', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  purgeText:      { color: '#ef4444', fontWeight: '900', fontSize: 10 },

  mb4:               { marginBottom: 16 },
  mt2:               { marginTop: 8 },
  sectionLabel:      { fontSize: 9, color: '#00cccc', marginBottom: 8, letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  selectionGroupWrap:{ gap: 8, flexDirection: 'row', flexWrap: 'wrap' },

  pill:            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  pillInactive:    { borderColor: '#1f2937' },
  pillActive:      { borderColor: '#00ffff', backgroundColor: 'rgba(0,51,51,0.4)' },
  pillTextInactive:{ color: '#6b7280', fontSize: 10 },
  pillTextActive:  { color: '#00ffff', fontSize: 10 },

  generateBtn:     { width: '100%', marginTop: 16, paddingVertical: 16, borderRadius: 4, alignItems: 'center' },
  btnActive:       { backgroundColor: '#00ffff' },
  btnGenerating:   { backgroundColor: '#003333' },
  generateBtnText: { color: '#000', fontWeight: '900', fontSize: 11, fontStyle: 'italic', letterSpacing: 3 },
  textCyanDim:     { color: '#00cccc' },

  outputHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1f2937', paddingBottom: 16, marginBottom: 16 },
  outputTitle:     { fontSize: 18, fontWeight: '900', color: '#fff', fontStyle: 'italic', letterSpacing: 2 },
  statusBadge:     { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, borderWidth: 1 },
  borderCyan:      { borderColor: '#00ffff' },
  borderRed:       { borderColor: '#ef4444' },
  textRed:         { color: '#ef4444', fontSize: 9 },
  statusText:      { fontSize: 9, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  loadingContainer:{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText:     { color: '#00ffff', fontSize: 10, textAlign: 'center', letterSpacing: 4, lineHeight: 20 },

  copyBoxContainer:{ backgroundColor: '#050505', borderColor: '#1f2937', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  copyBoxHeader:   { backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1f2937', flexDirection: 'row', justifyContent: 'space-between' },
  copyBoxTitle:    { color: '#00ffff', fontSize: 10, letterSpacing: 2, fontStyle: 'italic', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  copyBoxBtn:      { color: '#9ca3af', fontSize: 10, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  textGreen:       { color: '#4ade80' },
  copyBoxScroll:   { padding: 16 },
  copyBoxContent:  { color: '#d1d5db', fontSize: 12, lineHeight: 18 },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  warningPanel:    { borderColor: '#ef4444' },
  warningTitle:    { color: '#ef4444', fontSize: 18, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  warningText:     { color: '#d1d5db', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  warningBtn:      { backgroundColor: '#00ffff', paddingVertical: 12, borderRadius: 4, alignItems: 'center', marginTop: 8 },
  warningBtnText:  { color: '#000', fontWeight: '900', fontSize: 12, letterSpacing: 2 },
});
