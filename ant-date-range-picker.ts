import { css, html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import weekOfYear from 'dayjs/plugin/weekOfYear';

dayjs.extend(customParseFormat);
dayjs.extend(quarterOfYear);
dayjs.extend(weekOfYear);

export type PickerMode = 'date' | 'week' | 'month' | 'quarter' | 'year' | 'time';
export type PanelMode = PickerMode | 'decade';
export type RangeType = 'start' | 'end';
export type DateRangeValue = [Dayjs | null, Dayjs | null] | null;
export type DateRangePreset = { label: string; value: DateRangeValue | (() => DateRangeValue) };
export type DisabledTimes = {
  disabledHours?: () => number[];
  disabledMinutes?: (hour: number) => number[];
  disabledSeconds?: (hour: number, minute: number) => number[];
};
export type ShowTime = {
  format?: string;
  defaultValue?: [Dayjs, Dayjs];
  showHour?: boolean;
  showMinute?: boolean;
  showSecond?: boolean;
  hourStep?: number;
  minuteStep?: number;
  secondStep?: number;
};
export type DateRangePickerLocale = {
  locale?: string; startPlaceholder?: string; endPlaceholder?: string;
  previousMonth?: string; nextMonth?: string; today?: string; now?: string; ok?: string; monthBeforeYear?: boolean;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};
export type DateRender = (input: { current: Dayjs; today: Dayjs; range: RangeType }) => unknown;
export type ValueChangedDetail = {
  value: DateRangeValue; valueStrings: [string, string];
  source: RangeType | 'clear' | 'preset' | 'input';
};

const localeDefaults: Required<DateRangePickerLocale> = {
  locale: 'en-US', startPlaceholder: 'Start date', endPlaceholder: 'End date',
  previousMonth: 'Previous month', nextMonth: 'Next month', today: 'Today',
  now: 'Now', ok: 'OK', monthBeforeYear: true, weekStartsOn: 0,
};
const formats: Record<PickerMode, string> = {
  date: 'YYYY-MM-DD', week: 'YYYY-[W]ww', month: 'YYYY-MM',
  quarter: 'YYYY-[Q]Q', year: 'YYYY', time: 'HH:mm:ss',
};
const panelModes: PanelMode[] = ['date', 'month', 'year', 'decade'];

const rangeDate = (value: DateRangeValue, index: 0 | 1) => value?.[index] || null;
const cloneRange = (value: DateRangeValue): DateRangeValue => value ? [value[0], value[1]] : null;
const updateRange = (value: DateRangeValue, date: Dayjs | null, index: 0 | 1): DateRangeValue => {
  const next: [Dayjs | null, Dayjs | null] = value ? [value[0], value[1]] : [null, null];
  next[index] = date;
  return next;
};
const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Lit-native date range picker. Values, predicates, renderers and presets are
 * properties because they cannot be faithfully represented as HTML attributes.
 */
export class AntDateRangePicker extends LitElement {
  static properties = {
    value: { attribute: false }, defaultValue: { attribute: false }, defaultPickerValue: { attribute: false },
    open: { type: Boolean, reflect: true }, defaultOpen: { type: Boolean, attribute: 'default-open' },
    picker: { type: String }, mode: { attribute: false }, format: { attribute: false }, showTime: { attribute: false },
    disabled: { attribute: false }, disabledDate: { attribute: false }, disabledTime: { attribute: false },
    allowEmpty: { attribute: false }, presets: { attribute: false }, ranges: { attribute: false },
    locale: { attribute: false }, placeholder: { attribute: false }, inputReadOnly: { type: Boolean, attribute: 'input-read-only' },
    allowClear: { type: Boolean, attribute: 'allow-clear' }, placement: { type: String }, direction: { type: String },
    size: { type: String }, status: { type: String }, bordered: { type: Boolean }, dateRender: { attribute: false },
    renderExtraFooter: { attribute: false }, panelRender: { attribute: false },
  };

  declare value: DateRangeValue | undefined;
  declare defaultValue: DateRangeValue;
  declare defaultPickerValue: DateRangeValue;
  declare open: boolean | undefined;
  declare defaultOpen: boolean;
  declare picker: PickerMode;
  declare mode: [PanelMode, PanelMode] | undefined;
  declare format: string | string[] | undefined;
  declare showTime: boolean | ShowTime;
  declare disabled: boolean | [boolean, boolean];
  declare disabledDate?: (date: Dayjs) => boolean;
  declare disabledTime?: (date: Dayjs | null, type: RangeType) => DisabledTimes;
  declare allowEmpty: [boolean, boolean];
  declare presets: DateRangePreset[];
  declare ranges: Record<string, DateRangeValue | (() => DateRangeValue)>;
  declare locale: DateRangePickerLocale;
  declare placeholder?: [string, string];
  declare inputReadOnly: boolean;
  declare allowClear: boolean;
  declare placement: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';
  declare direction: 'ltr' | 'rtl';
  declare size: 'small' | 'middle' | 'large';
  declare status: '' | 'error' | 'warning';
  declare bordered: boolean;
  declare dateRender?: DateRender;
  declare renderExtraFooter?: (mode: PanelMode) => unknown;
  declare panelRender?: (panel: TemplateResult) => unknown;

  private selected: DateRangeValue = null;
  private active: 0 | 1 = 0;
  private internalOpen = false;
  private internalModes: [PanelMode, PanelMode] = ['date', 'date'];
  private view = dayjs();
  private inputTexts: [string, string] = ['', ''];
  private hover: Dayjs | null = null;
  private initialized = false;

  constructor() {
    super();
    this.defaultValue = null;
    this.defaultPickerValue = null;
    this.defaultOpen = false;
    this.picker = 'date';
    this.showTime = false;
    this.disabled = false;
    this.allowEmpty = [false, false];
    this.presets = [];
    this.ranges = {};
    this.locale = {};
    this.inputReadOnly = false;
    this.allowClear = true;
    this.placement = 'bottomLeft';
    this.direction = 'ltr';
    this.size = 'middle';
    this.status = '';
    this.bordered = true;
  }

  static styles = css`
    :host { --ant-primary:#1677ff; --ant-primary-bg:#e6f4ff; --ant-border:#d9d9d9; --ant-text:rgb(0 0 0 / 88%); --ant-muted:rgb(0 0 0 / 45%); display:inline-block; color:var(--ant-text); font:0.875rem/1.5715 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    *,*:before,*:after { box-sizing:border-box; } .picker { position:relative; display:inline-flex; width:100%; min-width:17.5rem; height:2rem; border:0.0625rem solid var(--ant-border); border-radius:0.375rem; background:#fff; transition:border-color .2s,box-shadow .2s; }
    .picker:hover,.picker.open,.picker:focus-within { border-color:var(--ant-primary); } .picker.open,.picker:focus-within { box-shadow:0 0 0 0.125rem rgb(5 145 255 / 10%); } .picker.small{height:1.5rem}.picker.large{height:2.5rem;font-size:1rem}.picker.borderless{border-color:transparent;box-shadow:none}.picker.disabled{color:rgb(0 0 0 / 25%);background:#f5f5f5}.picker.error{border-color:#ff4d4f}.picker.warning{border-color:#faad14}
    input { min-width:0; flex:1; padding:0 0.5rem; border:0; outline:0; color:inherit; background:transparent; font:inherit; } input::placeholder{color:var(--ant-muted)} input:disabled{cursor:not-allowed}.separator,.suffix{display:grid;place-items:center;color:var(--ant-muted)}.separator{padding:0 0.25rem}.suffix{width:1.75rem}.clear{width:1.75rem;border:0;color:var(--ant-muted);background:transparent;cursor:pointer;font-size:1.125rem}.clear:hover{color:var(--ant-text)}
    .popup { position:absolute; z-index:1050; top:calc(100% + 0.25rem); left:0; min-width:max-content; overflow:hidden; border-radius:0.5rem; background:#fff; box-shadow:0 0.375rem 1rem rgb(0 0 0 / 8%),0 0.1875rem 0.375rem -0.25rem rgb(0 0 0 / 12%); }.popup.top{top:auto;bottom:calc(100% + 0.25rem)}.popup.right{right:0;left:auto}.rtl{direction:rtl}.ant-picker-range-wrapper,.ant-picker-panel-container{position:relative}.ant-picker-panel-layout{display:flex;align-items:stretch}.panel-content{display:flex;min-width:0;flex-direction:column}.panels{display:flex}.panel{width:17.5rem;padding:0.75rem}.panel+.panel{border-left:0.0625rem solid #f0f0f0}
    .header{display:flex;align-items:center;height:2rem;margin-bottom:0.5rem;padding:0 0.5rem;border-bottom:0.0625rem solid #f0f0f0;font-size:0.875rem;font-weight:600}.header>button{min-width:1.6em;padding:0;border:0;color:var(--ant-muted);line-height:2rem;background:transparent;cursor:pointer}.header>button:hover{color:var(--ant-text)}.ant-picker-header-view{display:flex;flex:auto;justify-content:center;gap:0.25rem}.icon{height:2rem}.ant-picker-prev-icon,.ant-picker-next-icon,.ant-picker-super-prev-icon,.ant-picker-super-next-icon{position:relative;display:inline-block;width:0.4375rem;height:0.4375rem}.ant-picker-prev-icon:before,.ant-picker-next-icon:before{position:absolute;display:inline-block;width:0.4375rem;height:0.4375rem;border:0 solid currentcolor;border-top-width:0.09375rem;border-left-width:0.09375rem;content:''}.ant-picker-prev-icon:before{transform:rotate(-45deg)}.ant-picker-next-icon:before{transform:rotate(135deg)}.ant-picker-super-prev-icon,.ant-picker-super-next-icon{width:0.75rem}.ant-picker-super-prev-icon:before,.ant-picker-super-prev-icon:after,.ant-picker-super-next-icon:before,.ant-picker-super-next-icon:after{position:absolute;top:0;display:inline-block;width:0.4375rem;height:0.4375rem;border:0 solid currentcolor;border-top-width:0.09375rem;border-left-width:0.09375rem;content:''}.ant-picker-super-prev-icon:before{left:0;transform:rotate(-45deg)}.ant-picker-super-prev-icon:after{left:0.3125rem;transform:rotate(-45deg)}.ant-picker-super-next-icon:before{left:0;transform:rotate(135deg)}.ant-picker-super-next-icon:after{left:0.3125rem;transform:rotate(135deg)}.title{padding:0;border:0;color:inherit;line-height:2rem;background:transparent;cursor:pointer;font-size:0.875rem;font-weight:600}.title:hover{color:var(--ant-primary)}.ant-picker-body{padding:0 0.5rem}.ant-picker-content{width:100%;border-collapse:collapse;table-layout:fixed;text-align:center;font-size:0.875rem}.ant-picker-content th,.ant-picker-content td{position:relative;min-width:2rem;font-weight:400}.ant-picker-content th{height:2.25rem;color:var(--ant-text);font-size:0.875rem;vertical-align:middle}.ant-picker-cell{padding:0.125rem 0}.ant-picker-cell-inner{position:relative;z-index:2;display:inline-grid;min-width:2rem;height:2rem;place-items:center;border-radius:0.25rem;font-size:0.875rem}
    .cell{position:relative;z-index:0;height:2rem;color:inherit;cursor:pointer}.cell:before{position:absolute;top:50%;right:0;left:0;z-index:1;height:2rem;transform:translateY(-50%);content:''}.cell.outside,.cell.disabled{color:rgb(0 0 0 / 25%)}.cell.disabled{cursor:not-allowed;pointer-events:none}.cell.ant-picker-cell-in-view.ant-picker-cell-today .ant-picker-cell-inner:before{position:absolute;inset:0;z-index:1;border:0.0625rem solid var(--ant-primary);border-radius:0.25rem;content:''}.cell.ant-picker-cell-in-view.ant-picker-cell-in-range:before,.cell.ant-picker-cell-in-view.ant-picker-cell-range-start:not(.ant-picker-cell-range-start-single):before,.cell.ant-picker-cell-in-view.ant-picker-cell-range-end:not(.ant-picker-cell-range-end-single):before{background:var(--ant-primary-bg)}.cell.ant-picker-cell-in-view.ant-picker-cell-range-start:before{left:50%}.cell.ant-picker-cell-in-view.ant-picker-cell-range-end:before{right:50%}.cell.ant-picker-cell-in-view.ant-picker-cell-range-start .ant-picker-cell-inner,.cell.ant-picker-cell-in-view.ant-picker-cell-range-end .ant-picker-cell-inner{color:#fff;background:var(--ant-primary)}.cell.ant-picker-cell-in-view.ant-picker-cell-range-start:not(.ant-picker-cell-range-start-single):not(.ant-picker-cell-range-end) .ant-picker-cell-inner{border-radius:0.25rem 0 0 0.25rem}.cell.ant-picker-cell-in-view.ant-picker-cell-range-end:not(.ant-picker-cell-range-end-single):not(.ant-picker-cell-range-start) .ant-picker-cell-inner{border-radius:0 0.25rem 0.25rem 0}
    .cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-start:not(.ant-picker-cell-in-range):not(.ant-picker-cell-range-start):not(.ant-picker-cell-range-end):after,.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-end:not(.ant-picker-cell-in-range):not(.ant-picker-cell-range-start):not(.ant-picker-cell-range-end):after,.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-start.ant-picker-cell-range-start-single:after,.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-end.ant-picker-cell-range-end-single:after,.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover:not(.ant-picker-cell-in-range):after{position:absolute;top:50%;z-index:0;right:0.125rem;left:0.125rem;height:2rem;border-top:0.0625rem dashed #91caff;border-bottom:0.0625rem dashed #91caff;transform:translateY(-50%);content:''}.cell.ant-picker-cell-in-view.ant-picker-cell-in-range.ant-picker-cell-range-hover:before,.cell.ant-picker-cell-in-view.ant-picker-cell-range-start.ant-picker-cell-range-hover:before,.cell.ant-picker-cell-in-view.ant-picker-cell-range-end.ant-picker-cell-range-hover:before,.cell.ant-picker-cell-in-view.ant-picker-cell-range-start:not(.ant-picker-cell-range-start-single).ant-picker-cell-range-hover-start:before,.cell.ant-picker-cell-in-view.ant-picker-cell-range-end:not(.ant-picker-cell-range-end-single).ant-picker-cell-range-hover-end:before{background:#bae0ff}.cell.ant-picker-cell-range-hover.ant-picker-cell-range-end:after{left:50%}.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-edge-start:not(.ant-picker-cell-range-hover-edge-start-near-range):after,.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-start:after{left:0.25rem;border-left:0.0625rem dashed #91caff;border-radius:0.0625rem 0 0 0.0625rem}.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-edge-end:not(.ant-picker-cell-range-hover-edge-end-near-range):after,.cell.ant-picker-cell-in-view.ant-picker-cell-range-hover-end:after{right:0.25rem;border-right:0.0625rem dashed #91caff;border-radius:0 0.0625rem 0.0625rem 0}.cell:not(.disabled):not(.ant-picker-cell-selected):not(.ant-picker-cell-range-start):not(.ant-picker-cell-range-end):not(.ant-picker-cell-range-hover-start):not(.ant-picker-cell-range-hover-end):hover .ant-picker-cell-inner,.option:not(.disabled):hover{background:#f5f5f5}
    .basic-body{padding:0 0.5rem}.basic-content{height:16.5rem}.basic-content .ant-picker-cell{height:4.125rem;padding:0}.basic-content .ant-picker-cell-inner{width:5rem;white-space:nowrap}.ant-picker-decade-panel.panel{padding:0}.ant-picker-decade-panel .basic-body{padding:0 0.5rem}.ant-picker-decade-panel .ant-picker-cell-inner{padding:0 0.25rem}.basic-content .ant-picker-cell-in-view.ant-picker-cell-selected .ant-picker-cell-inner{color:#fff;background:var(--ant-primary)}.basic-content .ant-picker-cell-in-view:not(.ant-picker-cell-selected):not(.ant-picker-cell-disabled):hover .ant-picker-cell-inner{background:#f5f5f5}.presets{width:8.25rem;margin:0;padding:0.5rem;border-right:0.0625rem solid #f0f0f0;list-style:none}.presets button{width:100%;overflow:hidden;padding:0.3125rem 0.5rem;border:0;border-radius:0.25rem;color:inherit;background:transparent;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;font-size:0.875rem}.presets button:hover{background:#f5f5f5}
    .time{display:flex;gap:0.5rem;padding:0.5rem 0}.time select{min-width:4rem;height:10rem;border:0;border-radius:0.25rem;background:#fafafa}.time select:focus{outline:0.125rem solid var(--ant-primary-bg)}.footer{display:flex;align-items:center;min-height:2.5rem;padding:0.25rem 0.75rem;border-top:0.0625rem solid #f0f0f0}.footer-extra{margin-right:auto}.footer button{height:1.75rem;margin-left:0.5rem;padding:0 0.75rem;border:0.0625rem solid var(--ant-border);border-radius:0.25rem;background:#fff;cursor:pointer}.footer .primary{border-color:var(--ant-primary);color:#fff;background:var(--ant-primary)}@media(max-width:40rem){.panel+.panel,.presets{display:none}}
  `;

  connectedCallback(): void { super.connectedCallback(); document.addEventListener('pointerdown', this.onDocumentPointerDown, true); }
  disconnectedCallback(): void { document.removeEventListener('pointerdown', this.onDocumentPointerDown, true); super.disconnectedCallback(); }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!this.initialized) {
      this.initialized = true;
      this.selected = cloneRange(this.value === undefined ? this.defaultValue : this.value);
      this.internalOpen = this.open === undefined ? this.defaultOpen : this.open;
      this.internalModes = this.mode || [this.picker, this.picker];
      this.syncText();
      this.resetView();
    }
    if (changed.has('value') && this.value !== undefined && !this.equal(this.selected, this.value)) {
      this.selected = cloneRange(this.value); this.syncText(); this.resetView();
    }
    if (changed.has('open') && this.open !== undefined) this.internalOpen = this.open;
    if (changed.has('picker') && !this.mode) this.internalModes = [this.picker, this.picker];
  }

  render(): TemplateResult {
    const disabled = this.disabledState;
    return html`<div class=${classMap({picker:true,open:this.isOpen,disabled:disabled[0]&&disabled[1],small:this.size==='small',large:this.size==='large',borderless:!this.bordered,error:this.status==='error',warning:this.status==='warning',rtl:this.direction==='rtl'})} @click=${this.onPickerClick}>
      ${this.input(0)}<span class="separator" aria-hidden="true"><slot name="separator">→</slot></span>${this.input(1)}<span class="suffix"><slot name="suffix">▣</slot></span>
      ${this.allowClear && (this.selected?.[0] || this.selected?.[1]) ? html`<button class="clear" type="button" aria-label="Clear dates" @pointerdown=${this.preventFocusLoss} @click=${this.clear}>×</button>` : nothing}
      ${this.isOpen ? this.popup() : nothing}
    </div>`;
  }

  private input(index: 0 | 1): TemplateResult {
    return html`<input aria-label=${index ? 'End date' : 'Start date'} .value=${this.inputTexts[index]} ?disabled=${this.disabledState[index]} ?readonly=${this.inputReadOnly} placeholder=${this.placeholders[index]} @focus=${() => this.openAt(index)} @input=${(event:InputEvent) => this.onInput(event,index)} @keydown=${(event:KeyboardEvent) => this.onInputKeydown(event,index)} @blur=${() => this.commitText(index)} />`;
  }

  private popup(): TemplateResult {
    const layout = html`<div class="ant-picker-panels panels">${this.panel(this.view,'left')}${this.doublePanel ? this.panel(this.nextView(),'right') : nothing}</div>${this.footer()}`;
    const panel = this.panelRender?.(layout) ?? layout;
    return html`<div class=${classMap({'ant-picker-dropdown':true,'ant-picker-dropdown-range':true,popup:true,top:this.placement.startsWith('top'),right:this.placement.endsWith('Right'),rtl:this.direction==='rtl'})} role="dialog" aria-label="Choose date range" @pointerdown=${this.preventFocusLoss}><div class="ant-picker-range-wrapper"><div class="ant-picker-panel-container"><div class="ant-picker-panel-layout layout">
      ${this.presetList.length ? html`<ul class="ant-picker-presets presets">${this.presetList.map(preset => html`<li><button type="button" @click=${() => this.selectPreset(preset)}>${preset.label}</button></li>`)}</ul>` : nothing}
      <div class="panel-content">${panel}</div>
    </div></div></div></div>`;
  }

  private panel(view: Dayjs, position: 'left' | 'right'): TemplateResult {
    const mode = this.activeMode;
    const body = mode === 'date' || mode === 'week'
      ? html`${this.datePanel(view)}${this.showTime ? this.timePanel() : nothing}`
      : mode === 'time' ? this.timePanel() : this.basicPanel(view, mode);
    // The range-picker's decade transition is rendered as the bare 4×3
    // body. Keeping a date-style header here creates a 40px visual gap that
    // does not exist in the Vue panel.
    return html`<section class="ant-picker-panel ant-picker-${mode}-panel panel" aria-label="${mode} picker">${mode === 'decade' ? nothing : html`<header class="ant-picker-header header">${this.header(view,mode,position)}</header>`}${body}</section>`;
  }

  private header(view: Dayjs, mode: PanelMode, position: 'left' | 'right'): TemplateResult {
    const decadeStart = Math.floor(view.year()/10)*10;
    const centuryStart = Math.floor(view.year()/100)*100;
    const rangePanel = this.doublePanel;
    const showPrevious = !rangePanel || position !== 'right';
    const showNext = !rangePanel || position !== 'left';
    const year = mode === 'year'
      ? html`<button class="ant-picker-decade-btn title" type="button" @click=${this.raiseMode}>${decadeStart}-${decadeStart + 9}</button>`
      : mode === 'decade'
        ? html`${centuryStart}-${centuryStart + 99}`
        : html`<button class="ant-picker-year-btn title" type="button" @click=${this.raiseMode}>${view.year()}</button>`;
    const month = html`<button class="ant-picker-month-btn title" type="button" @click=${this.raiseMode}>${new Intl.DateTimeFormat(this.mergedLocale.locale,{month:'short'}).format(view.toDate())}</button>`;
    const viewButtons = mode==='date'||mode==='week' ? (this.mergedLocale.monthBeforeYear ? html`${month}${year}` : html`${year}${month}`) : year;
    const hasMonthStep = mode === 'date' || mode === 'week' || mode === 'month' || mode === 'quarter';
    const superStep = mode === 'year' ? 10 : mode === 'decade' ? 100 : 1;
    return html`${showPrevious ? html`<button class="ant-picker-header-super-prev-btn icon" type="button" aria-label="Previous range" @click=${() => this.moveYear(-superStep)}><span class="ant-picker-super-prev-icon"></span></button>` : html`<button class="ant-picker-header-super-prev-btn icon" type="button" style="visibility:hidden"><span class="ant-picker-super-prev-icon"></span></button>`}${hasMonthStep ? (showPrevious ? html`<button class="ant-picker-header-prev-btn icon" type="button" aria-label=${this.mergedLocale.previousMonth} @click=${() => this.move(-1,mode,position)}><span class="ant-picker-prev-icon"></span></button>` : html`<button class="ant-picker-header-prev-btn icon" type="button" style="visibility:hidden"><span class="ant-picker-prev-icon"></span></button>`) : nothing}<div class="ant-picker-header-view">${viewButtons}</div>${hasMonthStep ? (showNext ? html`<button class="ant-picker-header-next-btn icon" type="button" aria-label=${this.mergedLocale.nextMonth} @click=${() => this.move(1,mode,position)}><span class="ant-picker-next-icon"></span></button>` : html`<button class="ant-picker-header-next-btn icon" type="button" style="visibility:hidden"><span class="ant-picker-next-icon"></span></button>`) : nothing}${showNext ? html`<button class="ant-picker-header-super-next-btn icon" type="button" aria-label="Next range" @click=${() => this.moveYear(superStep)}><span class="ant-picker-super-next-icon"></span></button>` : html`<button class="ant-picker-header-super-next-btn icon" type="button" style="visibility:hidden"><span class="ant-picker-super-next-icon"></span></button>`}`;
  }

  private datePanel(month: Dayjs): TemplateResult {
    const locale = this.mergedLocale;
    const labels = Array.from({length:7},(_,i) => new Intl.DateTimeFormat(locale.locale,{weekday:'short'}).format(dayjs().day((i+locale.weekStartsOn)%7).toDate()));
    const first = month.startOf('month');
    const start = first.subtract((first.day()-locale.weekStartsOn+7)%7,'day');
    return html`<div class="ant-picker-body" @keydown=${this.onGridKeydown} @mouseleave=${() => this.setHover(null)}><table class="ant-picker-content"><thead><tr>${labels.map(label => html`<th>${label}</th>`)}</tr></thead><tbody>${Array.from({length:6},(_,row) => html`<tr>${Array.from({length:7},(_,column) => this.dateCell(start.add(row*7+column,'day'),month))}</tr>`)}</tbody></table></div>`;
  }

  private dateCell(date: Dayjs, month: Dayjs): TemplateResult {
    const [start,end] = this.selected || [null,null];
    const isStart = !!start && this.same(date,start);
    const isEnd = !!end && this.same(date,end);
    const inRange = !!start && !!end && this.betweenExclusive(date,start,end);
    // Match RangePicker's `panelHoverRangedValue`: the panel receives a
    // hover range only when it contains both endpoints in ascending order.
    // A lone hovered cell is intentionally left to the normal CSS :hover
    // rule; it must not receive range-hover classes or a dashed outline.
    const hoverCandidate = updateRange(this.selected, this.hover, this.active);
    const hoverStartValue = rangeDate(hoverCandidate,0);
    const hoverEndValue = rangeDate(hoverCandidate,1);
    const hasPanelHoverRange = !!hoverStartValue && !!hoverEndValue && this.after(hoverEndValue,hoverStartValue);
    const hoverRange = hasPanelHoverRange && this.betweenExclusive(date,hoverStartValue!,hoverEndValue!);
    const hoverStart = hasPanelHoverRange && this.same(date,hoverStartValue!);
    const hoverEnd = hasPanelHoverRange && this.same(date,hoverEndValue!);
    const previous = date.subtract(1,'day');
    const next = date.add(1,'day');
    const inView = date.isSame(month,'month');
    const edgeStart = (hoverRange || hoverEnd) && (!previous.isSame(month,'month') || (!!end && this.same(previous,end)));
    const edgeEnd = (hoverRange || hoverStart) && (!next.isSame(month,'month') || (!!start && this.same(next,start)));
    const startNearHover = hasPanelHoverRange && isStart && (this.same(previous,hoverStartValue!) || this.betweenExclusive(previous,hoverStartValue!,hoverEndValue!));
    const endNearHover = hasPanelHoverRange && isEnd && (this.same(next,hoverEndValue!) || this.betweenExclusive(next,hoverStartValue!,hoverEndValue!));
    const disabled = this.isDisabled(date);
    const content = this.dateRender ? this.dateRender({current:date,today:dayjs(),range:this.active?'end':'start'}) : date.date();
    return html`<td class=${classMap({'ant-picker-cell':true,cell:true,'ant-picker-cell-in-view':inView,'ant-picker-cell-disabled':disabled,'ant-picker-cell-in-range':inRange,'ant-picker-cell-range-start':isStart,'ant-picker-cell-range-end':isEnd,'ant-picker-cell-range-start-single':isStart&&!end,'ant-picker-cell-range-end-single':isEnd&&!start,'ant-picker-cell-range-start-near-hover':startNearHover,'ant-picker-cell-range-end-near-hover':endNearHover,'ant-picker-cell-range-hover':hoverRange,'ant-picker-cell-range-hover-start':hoverStart,'ant-picker-cell-range-hover-end':hoverEnd,'ant-picker-cell-range-hover-edge-start':edgeStart,'ant-picker-cell-range-hover-edge-end':edgeEnd,'ant-picker-cell-range-hover-edge-start-near-range':edgeStart&&!!end&&this.same(previous,end),'ant-picker-cell-range-hover-edge-end-near-range':edgeEnd&&!!start&&this.same(next,start),'ant-picker-cell-today':this.same(date,dayjs()),outside:!inView,disabled})} title=${date.format('YYYY-MM-DD')} @mouseenter=${() => this.setHover(date)} @click=${() => !disabled && this.selectDate(date)}><div class="ant-picker-cell-inner">${content}</div></td>`;
  }

  private basicPanel(view: Dayjs, mode: Exclude<PanelMode,'date'|'week'|'time'>): TemplateResult {
    const decade = Math.floor(view.year()/10)*10;
    const century = Math.floor(view.year()/100)*100;
    const options = mode === 'month' ? Array.from({length:12},(_,i) => ({label:new Intl.DateTimeFormat(this.mergedLocale.locale,{month:'short'}).format(view.month(i).toDate()),value:view.month(i).startOf('month'),inView:true})) : mode === 'quarter' ? [1,2,3,4].map(q => ({label:`Q${q}`,value:view.quarter(q).startOf('quarter'),inView:true})) : mode === 'year' ? Array.from({length:12},(_,i) => ({label:String(decade-1+i),value:view.year(decade-1+i).startOf('year'),inView:i>0&&i<11})) : Array.from({length:12},(_,i) => { const start=century-10+i*10; return {label:`${start}-${start+9}`,value:view.year(start).startOf('year'),inView:i>0&&i<11}; });
    const selected = rangeDate(this.selected,this.active);
    return html`<div class="ant-picker-body basic-body" @mouseleave=${() => this.setHover(null)}><table class="ant-picker-content basic-content"><tbody>${Array.from({length:4},(_,row) => html`<tr>${options.slice(row*3,row*3+3).map(option => { const disabled=this.isDisabled(option.value); const isSelected=mode==='decade' ? Math.floor(option.value.year()/10)===Math.floor(view.year()/10) : !!selected&&this.same(option.value,selected,mode); const year=option.value.year(); return html`<td class=${classMap({'ant-picker-cell':true,cell:true,'ant-picker-cell-in-view':option.inView,'ant-picker-cell-selected':isSelected,'ant-picker-cell-disabled':disabled,'ant-picker-cell-start':mode==='year'&&year%10===0,'ant-picker-cell-end':mode==='year'&&year%10===9,outside:!option.inView,disabled})} title=${option.label} @mouseenter=${() => this.setHover(option.value)} @click=${() => !disabled&&this.selectBasic(option.value,mode)}><div class="ant-picker-cell-inner">${option.label}</div></td>`; })}</tr>`)}</tbody></table></div>`;
  }

  private timePanel(): TemplateResult {
    const value = rangeDate(this.selected,this.active) || this.defaultTime || dayjs();
    const disabled = this.disabledTime?.(value,this.active?'end':'start') || {};
    const units = (max:number,current:number,step:number,blocked:number[]|undefined,change:(n:number)=>void) => html`<select size="6" .value=${String(current)} @change=${(e:Event) => change(Number((e.target as HTMLSelectElement).value))}>${Array.from({length:Math.ceil(max/step)},(_,i) => i*step).map(n => html`<option value=${n} ?disabled=${blocked?.includes(n)}>${pad(n)}</option>`)}</select>`;
    return html`<div class="time">${this.time.showHour ? units(24,value.hour(),this.time.hourStep,disabled.disabledHours?.(),n => this.setTime('hour',n)) : nothing}${this.time.showMinute ? units(60,value.minute(),this.time.minuteStep,disabled.disabledMinutes?.(value.hour()),n => this.setTime('minute',n)) : nothing}${this.time.showSecond ? units(60,value.second(),this.time.secondStep,disabled.disabledSeconds?.(value.hour(),value.minute()),n => this.setTime('second',n)) : nothing}</div>`;
  }

  private footer(): TemplateResult | typeof nothing {
    if (!this.renderExtraFooter && !this.needsConfirm) return nothing;
    return html`<footer class="ant-picker-footer footer"><span class="footer-extra">${this.renderExtraFooter?.(this.activeMode) ?? html`<slot name="footer"></slot>`}</span>${this.showTime ? html`<button type="button" @click=${this.now}>${this.mergedLocale.now}</button>` : nothing}${this.needsConfirm ? html`<button class="primary" type="button" ?disabled=${!rangeDate(this.selected,this.active)} @click=${this.confirm}>${this.mergedLocale.ok}</button>` : nothing}</footer>`;
  }

  private get isOpen(): boolean { return this.open === undefined ? this.internalOpen : this.open; }
  private get disabledState(): [boolean,boolean] { return Array.isArray(this.disabled) ? this.disabled : [this.disabled,this.disabled]; }
  private get mergedLocale(): Required<DateRangePickerLocale> { return {...localeDefaults,...this.locale}; }
  private get placeholders(): [string,string] { return this.placeholder || [this.mergedLocale.startPlaceholder,this.mergedLocale.endPlaceholder]; }
  private get displayFormat(): string { return Array.isArray(this.format) ? this.format[0] : this.format || (this.showTime&&this.picker==='date' ? `YYYY-MM-DD ${this.time.format}` : formats[this.picker]); }
  private get parseFormats(): string[] { return Array.isArray(this.format) ? this.format : [this.displayFormat]; }
  private get activeMode(): PanelMode { return (this.mode || this.internalModes)[this.active]; }
  private get doublePanel(): boolean { return !this.showTime && this.picker!=='time' && this.activeMode===this.picker; }
  private get needsConfirm(): boolean { return this.picker==='time'||(this.picker==='date'&&!!this.showTime); }
  private get defaultTime(): Dayjs | null { return typeof this.showTime==='object' ? this.showTime.defaultValue?.[this.active] || null : null; }
  private get time(): Required<Omit<ShowTime,'defaultValue'>> { const p=typeof this.showTime==='object'?this.showTime:{}; const format=p.format||'HH:mm:ss'; return {format,showHour:p.showHour??format.includes('H'),showMinute:p.showMinute??format.includes('m'),showSecond:p.showSecond??format.includes('s'),hourStep:p.hourStep||1,minuteStep:p.minuteStep||1,secondStep:p.secondStep||1}; }
  private get presetList(): DateRangePreset[] { return this.presets.length ? this.presets : Object.entries(this.ranges).map(([label,value])=>({label,value})); }

  private onPickerClick = (): void => { if (!this.isOpen&&!this.disabledState[this.active]) this.openAt(this.active); };
  private openAt(index:0|1): void { if(this.disabledState[index])return; this.active=index; this.hover=null; this.setOpen(true); this.resetView(); this.requestUpdate(); }
  private setOpen(next:boolean): void { if(this.isOpen===next)return; this.internalOpen=next; this.emit('open-changed',{open:next}); this.emit('openChange',next); this.requestUpdate(); }
  private onInput(event:InputEvent,index:0|1): void { this.inputTexts[index]=(event.target as HTMLInputElement).value; }
  private onInputKeydown(event:KeyboardEvent,index:0|1): void { if(event.key==='Escape'){this.syncText();this.setOpen(false)} else if(event.key==='Enter'){event.preventDefault();this.commitText(index)} else if(event.key==='ArrowDown'&&!this.isOpen)this.openAt(index); }
  private onGridKeydown = (event:KeyboardEvent): void => { const offsets:Record<string,number>={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}; if(!(event.key in offsets))return; event.preventDefault(); this.hover=(this.hover||rangeDate(this.selected,this.active)||this.view).add(offsets[event.key],'day'); this.requestUpdate(); };
  private commitText(index:0|1): void { const text=this.inputTexts[index]; if(!text){if(this.allowEmpty[index])this.commit(updateRange(this.selected,null,index),'input');else this.syncText();return} const parsed=this.parseFormats.map(format=>dayjs(text,format,true)).find(date=>date.isValid()); if(!parsed||this.isDisabled(parsed)){this.syncText();return} this.active=index;this.selectDate(parsed,'input'); }
  private selectDate(date:Dayjs,source:ValueChangedDetail['source']=this.active?'end':'start'): void { const index=this.active; const nextDate=this.withTime(date); let next=updateRange(this.selected,nextDate,index); const other=rangeDate(next,index?0:1); if(other&&((index===0&&this.after(nextDate,other))||(index===1&&this.after(other,nextDate))))next=index===0?[nextDate,null]:[null,nextDate]; this.calendarChange(next,index); this.selected=next;this.syncText();if(this.needsConfirm){this.requestUpdate();return}if(index===0&&!this.disabledState[1]){this.active=1;this.resetView();this.requestUpdate();return}this.commit(next,source);this.setOpen(false); }
  private selectBasic(date:Dayjs,mode:PanelMode): void {
    if (mode !== this.picker) {
      const next: PanelMode = mode === 'decade'
        ? 'year'
        : mode === 'year'
          ? (this.picker === 'quarter' ? 'quarter' : this.picker === 'month' ? 'month' : 'date')
          : 'date';
      this.internalModes = [next,next];
      this.view = date;
      this.panelChange();
      this.requestUpdate();
      return;
    }
    this.selectDate(date);
  }
  private setTime(unit:'hour'|'minute'|'second',number:number): void { const current=rangeDate(this.selected,this.active)||this.defaultTime||dayjs(); const date=unit==='hour'?current.hour(number):unit==='minute'?current.minute(number):current.second(number);this.selected=updateRange(this.selected,date,this.active);this.syncText();this.calendarChange(this.selected,this.active);this.requestUpdate(); }
  private selectPreset(preset:DateRangePreset): void { const value=typeof preset.value==='function'?preset.value():preset.value;if(!value)return;const ordered=value[0]&&value[1]&&value[0].isAfter(value[1])?[value[1],value[0]] as DateRangeValue:value;this.calendarChange(ordered,this.active);this.commit(ordered,'preset');this.setOpen(false); }
  private today = (): void => this.selectDate(dayjs());
  private now = (): void => this.selectDate(dayjs());
  private confirm = (): void => { this.commit(this.selected,this.active?'end':'start');this.emit('ok',{value:this.selected,valueStrings:this.strings(this.selected)});this.setOpen(false); };
  private clear = (): void => { const current=this.selected||[null,null];this.commit([this.disabledState[0]?current[0]:null,this.disabledState[1]?current[1]:null],'clear');this.setOpen(false); };
  private move(amount:number,mode:PanelMode,_position:'left'|'right'): void { this.view=mode==='date'||mode==='week'?this.view.add(amount,'month'):mode==='month'||mode==='quarter'?this.view.add(amount,'year'):this.view.add(amount*(mode==='year'?10:100),'year');this.requestUpdate(); }
  private moveYear(amount:number): void { this.view=this.view.add(amount,'year');this.requestUpdate(); }
  private raiseMode = (): void => {
    if (this.activeMode === 'time' || this.activeMode === 'decade') return;
    const next: PanelMode = this.activeMode === 'quarter' ? 'year' : panelModes[panelModes.indexOf(this.activeMode) + 1];
    this.internalModes = [next,next];
    this.panelChange();
    this.requestUpdate();
  };
  private nextView(): Dayjs { return this.picker==='year'?this.view.add(10,'year'):this.picker==='month'||this.picker==='quarter'?this.view.add(1,'year'):this.view.add(1,'month'); }
  private resetView(): void {
    const defaultView = rangeDate(this.defaultPickerValue,this.active);
    const start = rangeDate(this.selected,0);
    const end = rangeDate(this.selected,1);
    if (defaultView) {
      this.view = defaultView;
      return;
    }
    if (start && end) {
      // Same/adjacent ranges are anchored on their start panel, exactly as
      // vc-picker's getRangeViewDate does. For a wide range, the left panel
      // closes onto the month immediately preceding the end panel.
      const monthDistance = Math.abs(end.diff(start,'month'));
      this.view = monthDistance <= 1 ? start : end.subtract(1,'month');
      return;
    }
    this.view = rangeDate(this.selected,this.active)||start||end||dayjs();
  }
  private withTime(date:Dayjs): Dayjs { if(!this.showTime||this.picker!=='date')return date.startOf('day');const old=rangeDate(this.selected,this.active)||this.defaultTime||dayjs();return date.hour(old.hour()).minute(old.minute()).second(old.second()); }
  private isDisabled(date:Dayjs): boolean { if(this.disabledDate?.(date))return true;const other=rangeDate(this.selected,this.active?0:1);return !!other&&(this.active===0?this.after(date,other):this.after(other,date)); }
  private same(left:Dayjs,right:Dayjs,mode:PickerMode|'decade'=this.picker): boolean { return mode==='week'?left.week()===right.week()&&left.year()===right.year():mode==='month'?left.isSame(right,'month'):mode==='quarter'?left.quarter()===right.quarter()&&left.year()===right.year():mode==='year'?left.isSame(right,'year'):mode==='decade'?Math.floor(left.year()/10)===Math.floor(right.year()/10):mode==='time'?left.isSame(right):left.isSame(right,'day'); }
  private after(left:Dayjs,right:Dayjs): boolean { return this.picker==='month'?left.startOf('month').isAfter(right.startOf('month')):this.picker==='quarter'?left.startOf('quarter').isAfter(right.startOf('quarter')):this.picker==='year'?left.startOf('year').isAfter(right.startOf('year')):this.picker==='week'?left.startOf('week').isAfter(right.startOf('week')):left.isAfter(right,this.showTime||this.picker==='time'?'second':'day'); }
  private between(date:Dayjs,start:Dayjs,end:Dayjs): boolean { return !this.after(start,date) && !this.after(date,end); }
  /** Mirrors vc-picker's `isInRange`: endpoints have their own cell classes. */
  private betweenExclusive(date:Dayjs,start:Dayjs,end:Dayjs): boolean { return !this.same(date,start) && !this.same(date,end) && this.after(date,start) && this.after(end,date); }
  private setHover(date:Dayjs|null): void { this.hover=date;this.requestUpdate(); }
  private syncText(): void { this.inputTexts=[rangeDate(this.selected,0)?.format(this.displayFormat)||'',rangeDate(this.selected,1)?.format(this.displayFormat)||'']; }
  private strings(value:DateRangeValue): [string,string] { return [rangeDate(value,0)?.format(this.displayFormat)||'',rangeDate(value,1)?.format(this.displayFormat)||'']; }
  private equal(left:DateRangeValue,right:DateRangeValue): boolean { return left===right||!!(left&&right&&left[0]?.isSame(right[0])&&left[1]?.isSame(right[1])); }
  focus(): void { (this.renderRoot.querySelector('input') as HTMLInputElement | null)?.focus(); }
  blur(): void { this.renderRoot.querySelectorAll('input').forEach(input => input.blur()); }
  private commit(value:DateRangeValue,source:ValueChangedDetail['source']): void { const normalized=cloneRange(value);this.selected=normalized;this.syncText();const detail:ValueChangedDetail={value:normalized,valueStrings:this.strings(normalized),source};this.emit('value-changed',detail);this.emit('change',detail);this.emit('update:value',normalized);this.requestUpdate(); }
  private calendarChange(value:DateRangeValue,index:0|1): void { const detail={value,valueStrings:this.strings(value),range:index?'end':'start'};this.emit('calendar-change',detail);this.emit('calendarChange',detail); }
  private panelChange(): void { const detail={value:this.selected,modes:this.internalModes};this.emit('panel-change',detail);this.emit('panelChange',detail); }
  private emit(name:string,detail:unknown): void { this.dispatchEvent(new CustomEvent(name,{detail,bubbles:true,composed:true})); }
  private preventFocusLoss = (event:Event): void => event.preventDefault();
  private onDocumentPointerDown = (event:PointerEvent): void => { if(this.isOpen&&!event.composedPath().includes(this))this.setOpen(false); };
}

declare global { interface HTMLElementTagNameMap { 'ant-date-range-picker': AntDateRangePicker; } }
if (typeof customElements !== 'undefined' && !customElements.get('ant-date-range-picker')) customElements.define('ant-date-range-picker', AntDateRangePicker);
