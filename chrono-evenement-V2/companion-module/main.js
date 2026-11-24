const { InstanceBase, Regex, runEntrypoint, InstanceStatus, combineRgb } = require('@companion-module/base')

const STATUS_CHOICES = [
	{ id: 'idle', label: 'Prêt' },
	{ id: 'running', label: 'En cours' },
	{ id: 'paused', label: 'En pause' },
	{ id: 'overtime', label: 'Dépassement' },
	{ id: 'done', label: 'Terminé' },
	{ id: 'clock', label: 'Heure' },
]
const PHASE_LABEL = { g: 'vert', o: 'orange', r: 'rouge' }
const fmt = (n) => (n == null ? '' : `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`)
const range = (n) => Array.from({ length: n }, (_, i) => i + 1)

function hexToRgb(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
	if (!m) return null
	const n = parseInt(m[1], 16)
	return combineRgb((n >> 16) & 255, (n >> 8) & 255, n & 255)
}

class AliveTimerInstance extends InstanceBase {
	async init(config) {
		this.config = config
		this.state = {}
		this.setActionDefinitions(this.actions())
		this.setFeedbackDefinitions(this.feedbacks())
		this.setVariableDefinitions(this.variables())
		this.setPresetDefinitions(this.presets())
		this.updateStatus(InstanceStatus.Connecting)
		this.startPolling()
	}

	async destroy() {
		this.stopPolling()
	}

	async configUpdated(config) {
		this.config = config
		this.startPolling()
	}

	getConfigFields() {
		return [
			{ type: 'textinput', id: 'host', label: 'Adresse IP du chrono', width: 8, default: '127.0.0.1', regex: Regex.IP },
			{ type: 'number', id: 'port', label: 'Port', width: 4, min: 1, max: 65535, default: 9595 },
		]
	}

	url(path) {
		return `http://${this.config.host}:${this.config.port}/${path}`
	}

	async call(path) {
		try {
			const r = await fetch(this.url(path), { signal: AbortSignal.timeout(1500) })
			if (!r.ok) this.log('warn', `Commande ${path} refusée (HTTP ${r.status})`)
		} catch (e) {
			this.log('warn', `Commande ${path} impossible : ${e.message}`)
		}
	}

	/* ---- Lecture de l'état ---- */
	startPolling() {
		this.stopPolling()
		this.timer = setInterval(() => this.poll(), 250)
		this.poll()
	}

	stopPolling() {
		if (this.timer) clearInterval(this.timer)
		this.timer = null
	}

	async poll() {
		if (this.busy) return
		this.busy = true
		try {
			const r = await fetch(this.url('api/state'), { signal: AbortSignal.timeout(1000) })
			const s = await r.json()
			this.state = s
			if (this.connected !== true) {
				this.connected = true
				this.updateStatus(InstanceStatus.Ok)
			}
			const v = {
				time: s.text ?? '',
				status: (STATUS_CHOICES.find((c) => c.id === s.status) || {}).label || '',
				phase: PHASE_LABEL[s.phase] || '',
				title: s.title ?? '',
				message: s.message ?? '',
			}
			range(10).forEach((i) => {
				v[`mem${i}`] = (s.memories && s.memories[i - 1]) || ''
				v[`dur${i}`] = s.memoryDur ? fmt(s.memoryDur[i - 1]) : ''
			})
			range(20).forEach((i) => (v[`msg${i}`] = (s.messages && s.messages[i - 1]) || ''))
			v.dur = s.dur != null ? fmt(s.dur) : ''
			v.active = s.activeMemory ? (s.memories && s.memories[s.activeMemory - 1]) || '' : ''
			this.setVariableValues(v)
			this.checkFeedbacks()
		} catch (e) {
			if (this.connected !== false) {
				this.connected = false
				this.updateStatus(InstanceStatus.ConnectionFailure, 'Chrono injoignable')
			}
		} finally {
			this.busy = false
		}
	}

	/* ---- Définitions ---- */
	actions() {
		const simple = (name, path) => ({ name, options: [], callback: async () => this.call(path) })
		const numbered = (name, prefix, max) => ({
			name,
			options: [{ type: 'number', id: 'n', label: 'Numéro', default: 1, min: 1, max }],
			callback: async (a) => this.call(`${prefix}${a.options.n}`),
		})
		return {
			start: simple('Lancer', 'start'),
			toggle: simple('Pause / Reprendre', 'toggle'),
			pause: simple('Pause', 'pause'),
			reset: simple('Réinitialiser', 'reset'),
			macro: numbered('Rappeler un raccourci', 'macro', 10),
			msg_toggle: simple('Message : afficher / masquer', 'msg-toggle'),
			msg_show: simple('Message : afficher', 'msg-show'),
			msg_hide: simple('Message : masquer', 'msg-hide'),
			msg: numbered('Envoyer un message mémorisé', 'msg', 20),
			close: simple('Fermer la sortie', 'close'),
			out_open: simple('Ouvrir la sortie', 'out-open'),
			out_fill: numbered('Sortie plein écran sur l\'écran N', 'out-fill', 8),
			out_window: numbered('Sortie en fenêtre sur l\'écran N', 'out-window', 8),
			fullscreen: simple('Sortie : plein écran / fenêtre', 'fullscreen'),
		}
	}

	feedbacks() {
		return {
			status: {
				type: 'boolean',
				name: 'Statut du chrono',
				description: 'Actif quand le chrono est dans le statut choisi',
				defaultStyle: { bgcolor: combineRgb(0, 153, 0), color: combineRgb(255, 255, 255) },
				options: [{ type: 'dropdown', id: 'status', label: 'Statut', default: 'running', choices: STATUS_CHOICES }],
				callback: (fb) => this.state.status === fb.options.status,
			},
			phase: {
				type: 'advanced',
				name: 'Couleur du seuil (vert / orange / rouge)',
				description: 'Colore le bouton selon le seuil du décompte ; clignote en dépassement',
				options: [],
				callback: () => {
					const s = this.state
					if (s.status === 'paused') return { bgcolor: combineRgb(235, 140, 0), color: combineRgb(255, 255, 255) }
					if (s.status === 'idle' || s.status === 'clock' || !s.status) return { bgcolor: combineRgb(30, 30, 30), color: combineRgb(255, 255, 255) }
					const c = hexToRgb(s.phaseColor)
					if (c === null) return {}
					const off = (s.status === 'overtime' || (s.phase === 'r' && s.over)) && Math.floor(Date.now() / 500) % 2 === 1
					return off ? { bgcolor: combineRgb(30, 30, 30), color: c } : { bgcolor: c, color: combineRgb(255, 255, 255) }
				},
			},
			message_is: {
				type: 'boolean',
				name: 'Ce message mémorisé est affiché',
				defaultStyle: { bgcolor: combineRgb(0, 102, 204), color: combineRgb(255, 255, 255) },
				options: [{ type: 'number', id: 'n', label: 'Message mémorisé', default: 1, min: 1, max: 20 }],
				callback: (fb) => !!this.state.messageVisible && !!this.state.message && !!this.state.messages && this.state.messages[fb.options.n - 1] === this.state.message,
			},
			screen: {
				type: 'boolean',
				name: 'Sortie sur l\'écran N (plein écran ou fenêtre)',
				defaultStyle: { bgcolor: combineRgb(120, 60, 190), color: combineRgb(255, 255, 255) },
				options: [
					{ type: 'number', id: 'n', label: 'Écran', default: 1, min: 1, max: 8 },
					{ type: 'dropdown', id: 'fill', label: 'Mode', default: 'fill', choices: [{ id: 'fill', label: 'Plein écran' }, { id: 'window', label: 'Fenêtre' }] },
				],
				callback: (fb) => this.state.outScreen === fb.options.n && !!this.state.outFill === (fb.options.fill === 'fill'),
			},
			output: {
				type: 'boolean',
				name: 'Sortie ouverte',
				defaultStyle: { bgcolor: combineRgb(102, 51, 153), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => !!this.state.output,
			},
			message: {
				type: 'boolean',
				name: 'Message affiché',
				defaultStyle: { bgcolor: combineRgb(0, 102, 204), color: combineRgb(255, 255, 255) },
				options: [],
				callback: () => !!this.state.messageVisible,
			},
			memory: {
				type: 'boolean',
				name: 'Raccourci actif',
				defaultStyle: { bgcolor: combineRgb(0, 102, 204), color: combineRgb(255, 255, 255) },
				options: [{ type: 'number', id: 'n', label: 'Raccourci', default: 1, min: 1, max: 10 }],
				callback: (fb) => this.state.activeMemory === fb.options.n,
			},
		}
	}

	variables() {
		return [
			{ variableId: 'time', name: 'Temps affiché' },
			{ variableId: 'status', name: 'Statut' },
			{ variableId: 'phase', name: 'Couleur du seuil' },
			{ variableId: 'title', name: 'Titre' },
			{ variableId: 'message', name: 'Message' },
			{ variableId: 'dur', name: 'Durée réglée' },
			{ variableId: 'active', name: 'Nom du raccourci actif' },
			...range(10).map((i) => ({ variableId: `mem${i}`, name: `Nom du raccourci ${i}` })),
			...range(10).map((i) => ({ variableId: `dur${i}`, name: `Durée du raccourci ${i}` })),
			...range(20).map((i) => ({ variableId: `msg${i}`, name: `Message mémorisé ${i}` })),
		]
	}

	presets() {
		const L = this.label
		const W = combineRgb(255, 255, 255)
		const K = combineRgb(18, 18, 18)
		const G = combineRgb(0, 170, 70)
		const O = combineRgb(235, 140, 0)
		const B = combineRgb(0, 110, 220)
		const P = combineRgb(120, 60, 190)
		const btn = (category, name, style, action, feedbacks = []) => ({
			type: 'button',
			category,
			name,
			style: Object.assign({ size: '18', color: W, bgcolor: K }, style),
			steps: [{ down: action ? [action] : [], up: [] }],
			feedbacks,
		})
		const act = (actionId, options = {}) => ({ actionId, options })
		const st = (status, bgcolor) => ({ feedbackId: 'status', options: { status }, style: { bgcolor, color: W } })
		const msgOn = { feedbackId: 'message', options: {}, style: { bgcolor: B, color: W } }
		const p = {
			timer: btn('1 - Suivi', 'Temps (couleur du seuil, clignote en dépassement)', { text: `$(${L}:time)`, size: '24' }, act('toggle'), [{ feedbackId: 'phase', options: {} }]),
			status: btn('1 - Suivi', 'Statut', { text: `$(${L}:status)\\n$(${L}:phase)`, size: '14' }, null, [{ feedbackId: 'phase', options: {} }]),
			title: btn('1 - Suivi', 'Titre', { text: `$(${L}:title)`, size: '14' }, null),
			message_view: btn('1 - Suivi', 'Message affiché', { text: `$(${L}:message)`, size: '10' }, act('msg_toggle'), [msgOn]),
			play: btn('2 - Commandes', "PLAY (s'allume si en cours)", { text: 'PLAY', size: '24' }, act('start'), [st('running', G), st('overtime', G)]),
			pause: btn('2 - Commandes', "PAUSE (s'allume si en pause)", { text: 'PAUSE', size: '24' }, act('pause'), [st('paused', O)]),
			toggle: btn('2 - Commandes', 'Play / Pause (bascule)', { text: 'PLAY /\\nPAUSE', size: '18' }, act('toggle'), [st('running', G), st('paused', O)]),
			reset: btn('2 - Commandes', 'Réinitialiser', { text: 'RESET', size: '24', bgcolor: combineRgb(90, 20, 20) }, act('reset')),
			msg: btn('3 - Message', 'Message : afficher / masquer', { text: 'MESSAGE', size: '18' }, act('msg_toggle'), [msgOn]),
			msg_show: btn('3 - Message', 'Message : afficher', { text: 'MESSAGE\\nON', size: '18' }, act('msg_show'), [msgOn]),
			msg_hide: btn('3 - Message', 'Message : masquer', { text: 'MESSAGE\\nOFF', size: '18' }, act('msg_hide')),
			out_open: btn('4 - Sortie', 'Ouvrir la sortie', { text: 'SORTIE\\nOUVRIR', size: '14' }, act('out_open'), [{ feedbackId: 'output', options: {}, style: { bgcolor: P, color: W } }]),
			out_close: btn('4 - Sortie', 'Fermer la sortie', { text: 'SORTIE\\nFERMER', size: '14' }, act('close')),
			fullscreen: btn('4 - Sortie', 'Plein écran / fenêtre (écran actuel)', { text: 'PLEIN\\nÉCRAN', size: '14' }, act('fullscreen')),
		}
		range(3).forEach((i) => {
			p[`fill${i}`] = btn('4 - Sortie', `Sortie ${i} : plein écran`, { text: `SORTIE ${i}\\nPLEIN\\nÉCRAN`, size: '14' }, act('out_fill', { n: i }), [{ feedbackId: 'screen', options: { n: i, fill: 'fill' }, style: { bgcolor: P, color: W } }])
			p[`win${i}`] = btn('4 - Sortie', `Sortie ${i} : fenêtre`, { text: `SORTIE ${i}\\nFENÊTRE`, size: '14' }, act('out_window', { n: i }), [{ feedbackId: 'screen', options: { n: i, fill: 'window' }, style: { bgcolor: P, color: W } }])
		})
		range(10).forEach((i) => {
			p[`macro${i}`] = btn('5 - Raccourcis', `Raccourci ${i}`, { text: `${i}\\n$(${L}:mem${i})\\n$(${L}:dur${i})`, size: '14' }, act('macro', { n: i }), [
				{ feedbackId: 'memory', options: { n: i }, style: { bgcolor: B, color: W } },
			])
		})
		range(20).forEach((i) => {
			p[`msgslot${i}`] = btn('6 - Messages mémorisés', `Message mémorisé ${i}`, { text: `M${i}\\n$(${L}:msg${i})`, size: '10' }, act('msg', { n: i }), [
				{ feedbackId: 'message_is', options: { n: i }, style: { bgcolor: B, color: W } },
			])
		})
		return p
	}
}

runEntrypoint(AliveTimerInstance, [])
