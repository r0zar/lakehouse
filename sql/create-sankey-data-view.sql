-- Create final sankey data view combining nodes and links
-- Provides complete Sankey diagram data in the format: {nodes: [...], links: [...]}

CREATE VIEW `crypto_data.sankey_data` AS

WITH sankey_structure AS (
  SELECT 
    'nodes' as data_type,
    TO_JSON_STRING(STRUCT(
      name,
      category,
      subcategory
    )) as data
  FROM `crypto_data.sankey_nodes`
  
  UNION ALL
  
  SELECT 
    'links' as data_type,
    TO_JSON_STRING(STRUCT(
      source,
      target, 
      value,
      asset,
      currency_symbol
    )) as data
  FROM `crypto_data.sankey_links`
)

SELECT 
  data_type,
  ARRAY_AGG(PARSE_JSON(data)) as items
FROM sankey_structure
GROUP BY data_type;