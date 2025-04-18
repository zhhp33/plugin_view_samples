import React, { useEffect, useState, useRef } from 'react';
import { env, config, api, utils } from 'mdye';
import { ConfigProvider, Table, Flex, Spin, Pagination } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import CellControls from './components/CellControls';
import _ from 'lodash';

const subPageSize = 5;

export default function () {
  const { appId, worksheetId, viewId, controls } = config;
  const { showFields } = env;
  const subField = env.subField && env.subField[0];
  const lineHeight = env.lineHeight && env.lineHeight[0];
  const subFieldcontrol = _.find(controls, { controlId: subField }) || {};
  const [loading, setLoading] = useState(true);
  const [recordInfo, setRecordInfo] = useState(null);
  const [pageSize, setPageSize] = useState(Number(localStorage.getItem('plugin-view-table-pageSize')) || 10);
  const [subSheetInfoLoading, setSubSheetInfoLoading] = useState(false);
  const [subSheetInfoControls, setSubSheetInfoControls] = useState([]);
  const [pageIndex, setPageIndex] = useState(1);
  const [relationRows, setRelationRows] = useState({});

  async function loadRecords() {
    setLoading(true);
    const result = await api.getFilterRows({
      worksheetId,
      viewId,
      pageSize,
      pageIndex,
      requestParams: {
        plugin_detail_control: subField
      }
    });
    setRecordInfo(result);
    setLoading(false);
    result.data.forEach(item => {
      const subFieldRes = JSON.parse(item[subField]);
      if (subFieldRes.length) {
        loadRelationRows({
          subFieldRes: subFieldRes.map(data => JSON.parse(data.sourcevalue)),
          controlId: subField,
          rowId: item.rowid
        });
      }
    });
  }

  async function loadRelationRows({ subFieldRes = [], controlId, rowId, pageIndex = 1 }) {
    let loadRows = [];
    if (subFieldRes.length) {
      loadRows = subFieldRes;
    } else {
      const result = await api.getRowRelationRows({
        worksheetId,
        controlId,
        rowId,
        pageIndex,
        pageSize: subPageSize,
      });
      loadRows = result.data;
    }
    setRelationRows((data) => {
      const prevRes = relationRows[rowId] || [];
      const res = prevRes.filter(n => !n.rowid.includes('more')).concat(loadRows);
      return {
        ...data,
        [`pageIndex-${rowId}`]: pageIndex,
        [rowId]: loadRows.length < subPageSize ? res : res.concat({ rowid: `more-${rowId}` })
      }
    });
  }

  useEffect(() => {
    if (subFieldcontrol.dataSource) {
      setSubSheetInfoLoading(true);
      api.getWorksheetInfo({
        worksheetId: subFieldcontrol.dataSource,
        getTemplate: true
      }).then(data => {
        setSubSheetInfoControls(data.template.controls);
        setSubSheetInfoLoading(false);
      });
    }
  }, []);

  useEffect(() => {
    showFields.length && loadRecords();
  }, [pageIndex, pageSize]);

  if (!showFields.length) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%', color: '#9e9e9e' }}>
        请先在视图配置中配置显示字段
      </Flex>
    );
  }

  if (subSheetInfoLoading || (loading && !recordInfo)) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%' }}>
        <Spin />
      </Flex>
    );
  }

  const handleLoadMoreRelationRows = rowId => {
    const index = relationRows[`pageIndex-${rowId}`];
    loadRelationRows({
      controlId: subField,
      rowId,
      pageIndex: index + 1
    });
  }

  const handleClickRow = row => {
    if (row.isSub) {
      return;
    }
    utils.openRecordInfo({
      appId,
      worksheetId,
      viewId,
      recordId: row.rowid
    });
  }

  // 解析JSON字符串并提取 name/departmentName 字段，若为空数组则返回空字符串
  function parseJsonAndGetName(value) {
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      value === 'undefined'
    ) {
      return '';
    }
    try {
      // 兼容数组或对象
      let parsedValue = value;
      if (typeof value === 'string') {
        parsedValue = JSON.parse(value);
      }
      if (Array.isArray(parsedValue)) {
        if (parsedValue.length === 0) {
          return '';
        }
        // 取第一个对象的 name/fullname/departmentName 字段
        const item = parsedValue[0];
        if (item && item.name) {
          return item.name;
        }
        if (item && item.fullname) {
          return item.fullname;
        }
        if (item && item.departmentName) {
          return item.departmentName;
        }
      } else if (parsedValue && parsedValue.name) {
        return parsedValue.name;
      } else if (parsedValue && parsedValue.fullname) {
        return parsedValue.fullname;
      } else if (parsedValue && parsedValue.departmentName) {
        return parsedValue.departmentName;
      }
    } catch (e) {
      // 非 JSON 字符串直接返回空字符串
      return '';
    }
    return '';
  }

  const columns = showFields.concat(subField).map(id => {
    const control = _.find(controls, { controlId: id });
    if (control) {
      const baseConfig = {
        width: lineHeight === '1' ? 100 : undefined,
        ellipsis: lineHeight === '0',
      };
      if (control.controlId === subField) {
        return {
          title: subFieldcontrol.controlName,
          children: subFieldcontrol.showControls.map((id, index) => {
            const control = _.find(subSheetInfoControls, { controlId: id });
            return {
              title: control.controlName,
              type: control.type,
              dataIndex: control.controlId,
              key: control.controlId,
              ...baseConfig,
              render: (value, row) => {
                if (row.isSub && row.key.includes('more') && subFieldcontrol.showControls.length <= index + 1) {
                  return (
                    <Flex justify="flex-end">
                      <div className="view-more" onClick={() => handleLoadMoreRelationRows(row.key.replace('more-', ''))}>查看更多&gt;</div>
                    </Flex>
                  );
                }
                // 新增：如果 value 是空数组或 '[]'，直接返回空字符串
                if (value === '[]' || (Array.isArray(value) && value.length === 0)) {
                  return '';
                }
                // 优先显示 name 字段
                const name = parseJsonAndGetName(value);
                if (name) return name;
                return <CellControls value={value} control={control} />;
              },
              onCell: (row) => {
                if (row.isSub && row.key.includes('more')) {
                  if (subFieldcontrol.showControls.length <= index + 1) {
                    return { colSpan: subFieldcontrol.showControls.length };
                  } else {
                    return { rowSpan: 0 };
                  }
                }
                if (relationRows[row.rowid]) {
                  return { rowSpan: 0 };
                }
              }
            }
          })
        }
      } else {
        return {
          title: control.controlName,
          type: control.type,
          dataIndex: control.controlId,
          ...baseConfig,
          render: (value) => {
            // 新增：如果 value 是空数组或 '[]'，直接返回空字符串
            if (value === '[]' || (Array.isArray(value) && value.length === 0)) {
              return '';
            }
            // 优先显示 name 字段
            const name = parseJsonAndGetName(value);
            if (name) return name;
            return <CellControls value={value} control={control} />;
          },
          onCell: (row, index) => {
            const value = row[control.controlId];
            if (row.isSub && value === undefined) {
              return { rowSpan: 0 }
            }
            const currentRelationRows = relationRows[row.rowid];
            if (currentRelationRows && currentRelationRows.length) {
              return { rowSpan: 1 + currentRelationRows.length }
            }
          }
        }
      }
    } else {
      return false;
    }
  }).filter(_ => _);

  const dataSource = _.flatten(recordInfo.data.map((data, index) => {
    const record = { key: index, rowid: data.rowid };
    const currentRelationRows = relationRows[data.rowid];
    for (const key of showFields) {
      record[key] = data[key];
    }
    if (currentRelationRows && currentRelationRows.length) {
      const { showControls } = subFieldcontrol;
      const res = currentRelationRows.map(data => {
        const record = { key: data.rowid };
        for (const key of showControls) {
          record[key] = data[key];
        }
        record.isSub = 'true';
        return record;
      });
      return [record, ...res];
    }
    return record;
  }));

  return (
    <ConfigProvider locale={zhCN}>
      <Table
        bordered={true}
        size="small"
        loading={loading}
        dataSource={dataSource}
        columns={columns}
        onRow={(row) => {
          return {
            onClick: () => handleClickRow(row)
          }
        }}
        pagination={false}
      />
      <Flex justify="flex-end" style={{ padding: 10 }}>
        <Pagination
          size="small"
          pageSize={pageSize}
          total={recordInfo.count}
          showSizeChanger={true}
          onShowSizeChange={(current, size) => {
            localStorage.setItem('plugin-view-table-pageSize', size);
            setPageSize(size);
          }}
          onChange={index => {
            setRelationRows({});
            setPageIndex(index);
          }}
        />
      </Flex>
    </ConfigProvider>
  );
}
