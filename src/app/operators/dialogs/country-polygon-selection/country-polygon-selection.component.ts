import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {UserService} from '../../../users/user.service';
import {Operator} from '../../operator.model';
import {VectorData, VectorLayer} from '../../../layers/layer.model';
import {ResultTypes} from '../../result-type.model';
import {AbstractVectorSymbology, SimpleVectorSymbology} from '../../../layers/symbology/symbology.model';
import {RandomColorService} from '../../../util/services/random-color.service';
import {BehaviorSubject, Observable} from 'rxjs/Rx';
import {MdDialog} from '@angular/material';
import {ProjectService} from '../../../project/project.service';
import {Projection, Projections} from '../../projection.model';
import {CSVParameters, CsvSourceType} from '../../types/csv-source-type.model';
import {MappingQueryService} from '../../../queries/mapping-query.service';
import {WFSOutputFormats} from '../../../queries/output-formats/wfs-output-format.model';
import {
    TextualAttributeFilterEngineType,
    TextualAttributeFilterType
} from '../../types/textual-attribute-filter-type.model';

function nameComparator(a: string, b: string): number {
    const stripped = (s: string): string => s.replace(' ', '');
    return stripped(a).localeCompare(stripped(b));
}

@Component({
    selector: 'wave-country-polygon-selection',
    templateUrl: './country-polygon-selection.component.html',
    styleUrls: ['./country-polygon-selection.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CountryPolygonSelectionComponent implements OnInit {

    searchString$ = new BehaviorSubject<string>('');
    // entries$ = Observable.of([{name: 'Germany'}, {name: 'England'}, {name: 'France'}]);
    // new ReplaySubject<Array<{name: string, operator: Operator}>>(1);
    filteredEntries$: Observable<Array<{ [k: string]: any }>>;

    /*
    {
 		"filename": "file:///home/gfbio/data/dev/csv_source/country_borders.csv",
 		"on_error": "keep",
 		"separator": ",",
 		"geometry": "wkt",
 		"time": "none",
 		"columns": {
 			"x": "WKT",
 			"textual": ["FIPS", "ISO2", "ISO3", "UN", "NAME"],
 			"numeric": ["AREA", "POP2005", "REGION", "SUBREGION", "LON", "LAT"]
 		}
 	}
     */

    private sourceFile = 'file:///home/gfbio/data/dev/csv_source/country_borders.csv';
    private sourceParameters: CSVParameters = {
        header: 0,
        onError: 'keep',
        fieldSeparator: ',',
        geometry: 'wkt',
        time: 'none',
        columns: {
            x: 'WKT',
            textual: ['FIPS', 'ISO2', 'ISO3', 'UN', 'NAME'],
            numeric: ['AREA', 'POP2005', 'REGION', 'SUBREGION', 'LON', 'LAT'],
        },
        provenance: {
            citation: `TM_WORLD_BORDERS-0.1.ZIP

Provided by Bjorn Sandvik, thematicmapping.org

Use this dataset with care, as several of the borders are disputed.

The original shapefile (world_borders.zip, 3.2 MB) was downloaded from the Mapping Hacks website:
http://www.mappinghacks.com/data/

The dataset was derived by Schuyler Erle from public domain sources.
Sean Gilles did some clean up and made some enhancements.`,
            uri: '',
            license: 'Creative Commons Attribution-Share Alike License 3.0',
        },
    };
    private sourceProjection: Projection = Projections.WGS_84;
    private sourceIdColumn = 'NAME';
    private sourceOperator: Operator;



    constructor(private userService: UserService,
                private projectService: ProjectService,
                private randomColorService: RandomColorService,
                private mappingQueryService: MappingQueryService,
                public dialog: MdDialog) {
    }

    ngOnInit() {
        this.sourceOperator = this.createCsvSourceOperator();

        this.filteredEntries$ = Observable
            .combineLatest(
                this.getOperatorDataStream().map(
                    vectorData => {
                        console.log('vectorData', vectorData);
                        const data = vectorData.data.map(olFeature => olFeature.getProperties() as { [k: string]: any });
                        console.log('mapped', data);
                        return data;
                    }
                ),
                this.searchString$,
                (entries, searchString) => entries
                    .filter(entry => entry[this.sourceIdColumn].toString().indexOf(searchString) >= 0)
                    .sort((a, b) => nameComparator(a[this.sourceIdColumn].toString(), b[this.sourceIdColumn].toString()))
            );
    }

    /*
    refresh() {
        this.userService.getFeatureDBList()
            .map(entries => entries.sort())
            .subscribe(entries => this.entries$.next(entries));
    }

    openCSVDialog() {
        this.dialog.open(CsvDialogComponent)
            .afterClosed()
            .first()
            .subscribe(() => this.refresh());
    }
    */

    createCsvSourceOperator(): Operator {
        const csvSourceType = new CsvSourceType({
            dataURI: this.sourceFile,
            parameters: this.sourceParameters,
        });

        const operator = new Operator({
            operatorType: csvSourceType,
            resultType: ResultTypes.POLYGONS,
            projection: this.sourceProjection,
        });

        return this.sourceOperator = operator;
    }

    getOperatorDataStream(): Observable<VectorData> {
        return this.projectService.getTimeStream().flatMap(t => {
            return this.mappingQueryService.getWFSData({
                operator: this.sourceOperator,
                projection: this.sourceProjection,
                clustered: false,
                outputFormat: WFSOutputFormats.JSON,
                viewportSize: {
                    extent: this.sourceProjection.getExtent(),
                    resolution: 1,
                },
                time: t
            }).map(d => VectorData.olParse(t, this.sourceProjection, this.sourceProjection.getExtent(), d));
        });
    }

    createFilterOperator(key: string): Operator {
        const filterOperatorType = new TextualAttributeFilterType({
            attributeName: this.sourceIdColumn,
            engine: TextualAttributeFilterEngineType.EXACT,
            searchString: key,
        });

        return new Operator({
            operatorType: filterOperatorType,
            resultType: this.sourceOperator.resultType,
            projection: this.sourceOperator.projection,
            polygonSources: [this.createCsvSourceOperator()]
        });
    }

    addLayer(layerName: string, operator: Operator) {
        const color = this.randomColorService.getRandomColor();
        let symbology: AbstractVectorSymbology;
        symbology = new SimpleVectorSymbology({
            fillRGBA: color,
        });

        const layer = new VectorLayer({
            name: layerName,
            operator: operator,
            symbology: symbology,
        });
        this.projectService.addLayer(layer);
    }
}
