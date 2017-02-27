import {Component, ChangeDetectionStrategy, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit} from '@angular/core';
import {FormBuilder, FormGroup, Validators, AbstractControl} from '@angular/forms';
import {Observable, Subscription, Subject, ReplaySubject} from 'rxjs/Rx';
import {DataTypes, DataType} from '../../datatype.model';
import {WaveValidators} from '../../../util/form.validators';
import {MdDialogRef} from '@angular/material';
import {PlotService} from '../../../../plots/plot.service';
import {Layer} from '../../../../layers/layer.model';
import {Symbology} from '../../../../symbology/symbology.model';
import {HistogramType} from '../../types/histogram-type.model';
import {Operator} from '../../operator.model';
import {ResultTypes} from '../../result-type.model';
import {Unit} from '../../unit.model';
import {Plot} from '../../../../plots/plot.model';
import {MappingQueryService} from '../../../../queries/mapping-query.service';

function isVectorLayer(layer: Layer<Symbology>): boolean {
    return layer ? ResultTypes.VECTOR_TYPES.indexOf(layer.operator.resultType) >= 0 : false;
}

@Component({
    selector: 'wave-histogram-operator',
    templateUrl: './histogram-operator.component.html',
    styleUrls: ['histogram-operator.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistogramOperatorComponent implements OnInit, AfterViewInit, OnDestroy {
    // make public to template
    ResultTypes = ResultTypes;
    isVectorLayer = isVectorLayer;
    //

    form: FormGroup;

    attributes$ = new  ReplaySubject<Array<string>>();

    private subscriptions: Array<Subscription> = [];

    constructor(private plotService: PlotService,
                private mappingQueryService: MappingQueryService,
                private formBuilder: FormBuilder,
                private dialogRef: MdDialogRef<HistogramOperatorComponent>) {
    }

    ngOnInit() {
        const layerControl = this.formBuilder.control(undefined, Validators.required);
        let rangeTypeControl = this.formBuilder.control('data', Validators.required);
        this.form = this.formBuilder.group({
            name: ['Filtered Values', Validators.required],
            layer: layerControl,
            attribute: [undefined, WaveValidators.conditionalValidator(
                Validators.required, () => isVectorLayer(layerControl.value)
            )],
            rangeType: rangeTypeControl,
            range: this.formBuilder.group({
                min: [undefined],
                max: [undefined],
            }, WaveValidators.conditionalValidator(
                WaveValidators.minAndMax('min', 'max', {checkBothExist: true}),
                () => rangeTypeControl.value === 'custom'
            )),
            autoBuckets: [true, Validators.required],
            numberOfBuckets: [20, Validators.required],
        });

        this.form.statusChanges.subscribe(status => console.log("STATUS", status, this.form.errors));

        // this.subscriptions.push(
        //     this.form.controls['attribute'].valueChanges.subscribe(() => {
        //         setTimeout(() => this.changeDetectorRef.markForCheck(), 2000);
        //     })
        // );

        // this.subscriptions.push(
        //     rangeTypeControl.valueChanges.subscribe(rangeType => {
        //         this.form.controls['range'].updateValueAndValidity({
        //             onlySelf: false,
        //             emitEvent: true,
        //         });
        //     })
        // );

        this.subscriptions.push(
            this.form.controls['layer'].valueChanges.map(layer => {
                // side effect!!!
                this.form.controls['attribute'].setValue(undefined);

                if (layer) {
                    return layer.operator.attributes.filter((attribute: string) => {
                        return DataTypes.ALL_NUMERICS.indexOf(layer.operator.dataTypes.get(attribute)) >= 0;
                    }).toArray();
                } else {
                    return [];
                }
            }).subscribe(this.attributes$)
        );
    }

    ngAfterViewInit() {
        setTimeout(() => this.form.updateValueAndValidity(), 0);
    }

    ngOnDestroy() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe());
    }

    add() {
        const inputOperator = (this.form.controls['layer'].value as Layer<Symbology>).operator;

        const attributeName = this.form.controls['attribute'].value as string;

        let range: {min: number, max: number} | string = this.form.controls['rangeType'].value as string;
        if (range === 'custom') {
            range = this.form.controls['range'].value as {min: number, max: number};
        }

        let buckets: number = undefined;
        if (!this.form.controls['autoBuckets'].value) {
            buckets = this.form.controls['numberOfBuckets'].value as number;
        }

        const outputName: string = this.form.controls['name'].value;

        const operator = new Operator({
            operatorType: new HistogramType({
                attribute: attributeName,
                range: range,
                buckets: buckets,
            }),
            resultType: ResultTypes.PLOT,
            projection: inputOperator.projection,
            attributes: [],
            dataTypes: new Map<string, DataType>(),
            units: new Map<string, Unit>(),
            rasterSources: inputOperator.resultType === ResultTypes.RASTER ? [inputOperator] : [],
            pointSources: inputOperator.resultType === ResultTypes.POINTS ? [inputOperator] : [],
            lineSources: inputOperator.resultType === ResultTypes.LINES ? [inputOperator] : [],
            polygonSources: inputOperator.resultType === ResultTypes.POLYGONS ? [inputOperator] : [],
        });

        this.plotService.addPlot(new Plot({
            name: outputName,
            operator: operator,
            data: this.mappingQueryService.getPlotDataStream(operator),
        }));

        this.dialogRef.close();
    }

}
