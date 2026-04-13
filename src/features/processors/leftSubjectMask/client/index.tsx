import { h, Component } from 'preact';
import type { Options as LeftSubjectMaskOptions } from '../shared/meta';
import * as style from 'client/lazy-app/Compress/Options/style.css';
import { preventDefault, inputFieldValueAsNumber } from 'client/lazy-app/util';
import Range from 'client/lazy-app/Compress/Options/Range';

interface Props {
  options: LeftSubjectMaskOptions;
  onChange(newOptions: LeftSubjectMaskOptions): void;
}

export class Options extends Component<Props> {
  private onChange = (event: Event) => {
    const form = (event.currentTarget as HTMLElement).closest(
      'form',
    ) as HTMLFormElement;
    const { options } = this.props;

    this.props.onChange({
      threshold: inputFieldValueAsNumber(form.threshold, options.threshold),
      leftBias: inputFieldValueAsNumber(form.leftBias, options.leftBias),
      minRegionRatio: inputFieldValueAsNumber(
        form.minRegionRatio,
        options.minRegionRatio,
      ),
      featherRadius: inputFieldValueAsNumber(
        form.featherRadius,
        options.featherRadius,
      ),
    });
  };

  render({ options }: Props) {
    return (
      <form class={style.optionsSection} onSubmit={preventDefault}>
        <div class={style.optionOneCell}>
          <Range
            name="threshold"
            min="0"
            max="1"
            step="0.01"
            value={options.threshold}
            onInput={this.onChange}
          >
            Subject threshold:
          </Range>
        </div>
        <div class={style.optionOneCell}>
          <Range
            name="leftBias"
            min="0"
            max="1"
            step="0.01"
            value={options.leftBias}
            onInput={this.onChange}
          >
            Left-side bias:
          </Range>
        </div>
        <div class={style.optionOneCell}>
          <Range
            name="minRegionRatio"
            min="0.001"
            max="0.2"
            step="0.001"
            value={options.minRegionRatio}
            onInput={this.onChange}
          >
            Min region size:
          </Range>
        </div>
        <div class={style.optionOneCell}>
          <Range
            name="featherRadius"
            min="0"
            max="3"
            step="1"
            value={options.featherRadius}
            onInput={this.onChange}
          >
            Feather radius:
          </Range>
        </div>
      </form>
    );
  }
}
