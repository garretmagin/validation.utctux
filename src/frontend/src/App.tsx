import { useState, useEffect, useMemo } from "react";
import { Header, TitleSize } from "azure-devops-ui/Header";
import { Card } from "azure-devops-ui/Card";
import {
  Table,
  SimpleTableCell,
} from "azure-devops-ui/Table";
import type { ITableColumn } from "azure-devops-ui/Table";
import { ObservableValue } from "azure-devops-ui/Core/Observable";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { Spinner, SpinnerSize } from "azure-devops-ui/Spinner";
import { ZeroData, ZeroDataActionType } from "azure-devops-ui/ZeroData";
import {
  MessageCard,
  MessageCardSeverity,
} from "azure-devops-ui/MessageCard";
import { Toggle } from "azure-devops-ui/Toggle";
import type { IHeaderCommandBarItem } from "azure-devops-ui/HeaderCommandBar";

interface WeatherForecast {
  date: string;
  temperatureC: number;
  temperatureF: number;
  summary: string;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const COL_WIDTH_DATE = new ObservableValue(-30);
const COL_WIDTH_SUMMARY = new ObservableValue(-40);
const COL_WIDTH_TEMP = new ObservableValue(-30);

function App() {
  const [weatherData, setWeatherData] = useState<WeatherForecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useCelsius, setUseCelsius] = useState(false);

  const fetchWeatherForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/weatherforecast");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: WeatherForecast[] = await response.json();
      setWeatherData(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch weather data"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeatherForecast();
  }, []);

  const columns: ITableColumn<WeatherForecast>[] = useMemo(
    () => [
      {
        id: "date",
        name: "Date",
        width: COL_WIDTH_DATE,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<WeatherForecast>,
          item: WeatherForecast
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <span>{formatDate(item.date)}</span>
          </SimpleTableCell>
        ),
      },
      {
        id: "summary",
        name: "Summary",
        width: COL_WIDTH_SUMMARY,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<WeatherForecast>,
          item: WeatherForecast
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <span>{item.summary}</span>
          </SimpleTableCell>
        ),
      },
      {
        id: "temperature",
        name: useCelsius ? "Temp (°C)" : "Temp (°F)",
        width: COL_WIDTH_TEMP,
        renderCell: (
          _rowIndex: number,
          columnIndex: number,
          tableColumn: ITableColumn<WeatherForecast>,
          item: WeatherForecast
        ) => (
          <SimpleTableCell
            columnIndex={columnIndex}
            tableColumn={tableColumn}
            key={columnIndex}
          >
            <span className="font-weight-semibold">
              {useCelsius ? `${item.temperatureC}°C` : `${item.temperatureF}°F`}
            </span>
          </SimpleTableCell>
        ),
      },
    ],
    [useCelsius]
  );

  const itemProvider = useMemo(
    () => new ArrayItemProvider<WeatherForecast>(weatherData),
    [weatherData]
  );

  const commandBarItems: IHeaderCommandBarItem[] = [
    {
      id: "refresh",
      text: "Refresh",
      iconProps: { iconName: "Refresh" },
      onActivate: () => { fetchWeatherForecast(); },
      important: true,
      disabled: loading,
    },
  ];

  return (
    <div className="flex-grow flex-column">
      <Header
        title="Weather Forecast"
        titleSize={TitleSize.Large}
        commandBarItems={commandBarItems}
      />

      <div className="page-content flex-grow flex-column padding-16">
        <div className="flex-row flex-center margin-bottom-16">
          <Toggle
            checked={useCelsius}
            onChange={(_e, checked) => setUseCelsius(checked)}
            text="Use Celsius"
            offText="°F"
            onText="°C"
          />
        </div>

        {error && (
          <MessageCard
            className="margin-bottom-16"
            severity={MessageCardSeverity.Error}
            onDismiss={() => setError(null)}
          >
            {error}
          </MessageCard>
        )}

        {loading && weatherData.length === 0 ? (
          <div className="flex-grow flex-row flex-center">
            <Spinner size={SpinnerSize.large} label="Loading forecast..." />
          </div>
        ) : weatherData.length === 0 && !error ? (
          <ZeroData
            primaryText="No forecast data"
            secondaryText="Click Refresh to load weather forecast data."
            imageAltText="No data"
            actionText="Refresh"
            actionType={ZeroDataActionType.ctaButton}
            onActionClick={() => fetchWeatherForecast()}
          />
        ) : (
          <Card
            className="flex-grow"
            titleProps={{ text: "5-Day Forecast" }}
          >
            <Table<WeatherForecast>
              columns={columns}
              itemProvider={itemProvider}
              role="table"
            />
          </Card>
        )}
      </div>
    </div>
  );
}

export default App;
